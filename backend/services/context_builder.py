"""
컨텍스트 빌더.
현재 메시지 + 메모리 + 페르소나 + 무드를 조합해 LLM에 넘길 컨텍스트를 구성한다.

rule-based 처리 항목 (AI 호출 없음):
- 음성 에너지 레벨 분류
- 화면 컨텍스트 주입
- 세션 시간 알림
- 오너 감정 상태 표시
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_OWNER_USER_ID = "owner"


def _build_gap_hint(gap_hours: Optional[float]) -> str:
    """마지막 대화로부터 경과 시간 → 재회 힌트."""
    if gap_hours is None or gap_hours < 8:
        return ""
    if gap_hours < 24:
        return "오늘 처음 만남. 반갑게 재개하는 느낌."
    if gap_hours < 72:
        return f"마지막 대화로부터 {int(gap_hours)}시간 지남. 짧게 안부 확인 자연스러움."
    if gap_hours < 168:
        return f"마지막 대화로부터 {int(gap_hours // 24)}일 지남. 공백 느껴짐."
    days = int(gap_hours // 24)
    return f"마지막 대화로부터 {days}일 지남. 관계 온도 소폭 하락. 다시 데우는 과정 자연스러움."


def _build_time_hint() -> str:
    """현재 시각 기준 하루 리듬 힌트."""
    from datetime import datetime
    hour = datetime.now().hour
    if 6 <= hour < 11:
        return "오전. 에너지 있는 시작."
    if 18 <= hour < 23:
        return "저녁. 편안한 분위기."
    if 23 <= hour or hour < 2:
        return "자정. 걱정 모드 슬금슬금."
    if 2 <= hour < 6:
        return "새벽. SLEEPY + 걱정. 자라고 한 번쯤은 말해야 함."
    return ""


async def build_context(
    message: str,
    mood: str,
    persona: dict,
    interaction_type: str,
    owner_emotion: str = "NEUTRAL",
    voice_mode: bool = False,
    audio_features: Optional[dict] = None,
    visual_context: Optional[str] = None,
    session_duration: int = 0,
    is_first_message: bool = False,
    memories: Optional[list[dict]] = None,
    session_hint: str = "",
    gap_hours: Optional[float] = None,
) -> dict:
    """
    LLM 호출에 필요한 컨텍스트를 구성한다.

    Parameters
    ----------
    message          : 오너 메시지
    mood             : 현재 무드
    persona          : data/settings.json persona 딕트
    interaction_type : 'coding' | 'chat' | 'game' | 'general'
    owner_emotion    : 추정 오너 감정
    voice_mode       : 음성 응답 제약 여부
    audio_features   : {"energy": float, "rising_tone": bool, ...}
    visual_context   : OCR/Vision 화면 설명 (Phase 4)
    session_duration : 세션 경과 시간 (분)
    is_first_message : 이 대화의 첫 메시지 여부
    memories         : 이미 검색된 장기기억 목록 (pipeline이 반드시 넘길 것)
    session_hint     : judge_session_start()가 반환한 system_hint (pipeline이 넘김)

    Returns
    -------
    dict with keys: system_prompt, use_think, extra_context
    """
    from backend.services.llm import build_system_prompt, should_use_think

    memory_list = [m["fact"] for m in memories] if memories else None

    # 취향/관점 스텁 (PROMPT_06에서 채워짐)
    preferences = ""
    philosophy = ""
    try:
        from backend.services.preference_service import preference_system  # type: ignore[import]
        preferences = await preference_system.get_context_string()
    except ImportError:
        logger.debug("preference_service: Phase 미구현 상태")
    except AttributeError as e:
        logger.error("preference_service.get_context_string() 인터페이스 불일치: %s", e)
    except Exception as e:
        logger.error("preference_system 호출 실패: %s", e)

    try:
        from backend.services.philosophy_service import build_philosophy_context  # type: ignore[import]
        philosophy = await build_philosophy_context()
    except ImportError:
        logger.debug("philosophy_service: Phase 미구현 상태")
    except AttributeError as e:
        logger.error("philosophy_service.build_philosophy_context() 인터페이스 불일치: %s", e)
    except Exception as e:
        logger.error("philosophy_service 호출 실패: %s", e)

    # SPEC-06: warmth + identity 주입
    warmth_hint = ""
    identity_block = ""
    try:
        from backend.services.hana_state_service import get_state
        from backend.services.warmth_service import get_warmth_hint
        from backend.services.identity_service import load_identity, build_identity_prompt
        state = await get_state()
        warmth = float(state.get("relationship_warmth", 0.0))
        warmth_hint = get_warmth_hint(warmth)
        identity = load_identity()
        identity_block = build_identity_prompt(identity, warmth)
    except Exception as e:
        logger.error("SPEC-06 warmth/identity 주입 실패: %s", e)

    system_prompt = build_system_prompt(
        mood=mood,
        persona=persona,
        interaction_type=interaction_type,
        voice_mode=voice_mode,
        memories=memory_list,
        preferences=preferences,
        philosophy=philosophy,
    )

    # warmth + identity 프롬프트 앞에 prepend
    prefix_blocks: list[str] = []
    if identity_block:
        prefix_blocks.append(identity_block)
    if warmth_hint:
        prefix_blocks.append(f"## 관계 온도\n{warmth_hint}")
    if prefix_blocks:
        system_prompt = "\n\n".join(prefix_blocks) + "\n\n" + system_prompt

    # 상황 컨텍스트 주입 (rule-based, AI 호출 없음)
    situation: list[str] = []
    # SPEC-06: gap + time hints
    gap_hint = _build_gap_hint(gap_hours)
    if gap_hint:
        situation.append(gap_hint)
    time_hint = _build_time_hint()
    if time_hint:
        situation.append(time_hint)
    if audio_features:
        e = audio_features.get("energy", 1.0)
        if e < 0.4:
            situation.append("음성: 기운 없음 (낮은 에너지)")
        elif e > 0.9:
            situation.append("음성: 활기참 (높은 에너지)")
        if audio_features.get("rising_tone"):
            situation.append("어조 상승 (질문 또는 불확실함)")
    if visual_context:
        situation.append(f"화면: {visual_context}")
    if session_duration >= 60:
        situation.append(f"세션 경과: {session_duration}분")
    if owner_emotion not in ("NEUTRAL", None, ""):
        emotion_kr = {"HAPPY": "기쁨/흥분", "DISTRESSED": "힘듦/걱정"}.get(
            owner_emotion, owner_emotion
        )
        situation.append(f"오너 현재 감정: {emotion_kr}")
    if situation:
        system_prompt += "\n\n## 현재 상황\n" + "\n".join(f"- {s}" for s in situation)

    # 세션 시작 힌트: pipeline이 넘겨준 session_hint를 그대로 주입
    if is_first_message and session_hint:
        system_prompt += f"\n\n## Session Context\n{session_hint}"

    use_think = should_use_think(message, interaction_type)
    if voice_mode:
        use_think = False

    return {
        "system_prompt": system_prompt,
        "use_think": use_think,
        "extra_context": {
            "memory":         memories,
            "mood":           mood,
            "owner_emotion":  owner_emotion,
            "interaction_type": interaction_type,
            "audio_features": audio_features,
            "visual_context": visual_context,
            "session_duration": session_duration,
        },
    }
