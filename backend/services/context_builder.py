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
    memories         : 이미 검색된 장기기억 목록 (없으면 DB 조회)

    Returns
    -------
    dict with keys: system_prompt, use_think, extra_context
    """
    from backend.services.llm import build_system_prompt, should_use_think
    from backend.services.sulky_service import is_sulky

    # 메모리가 없으면 DB 조회
    if memories is None:
        from backend.services.memory import search_memory
        memories = await search_memory(_OWNER_USER_ID, message)

    memory_list = [m["fact"] for m in memories] if memories else None

    # 취향/관점 스텁 (PROMPT_06에서 채워짐)
    preferences = ""
    philosophy = ""
    try:
        from backend.services.preference_service import preference_system  # type: ignore[import]
        preferences = await preference_system.get_context_string()
    except (ImportError, AttributeError):
        pass

    try:
        from backend.services.philosophy_service import build_philosophy_context  # type: ignore[import]
        philosophy = await build_philosophy_context()
    except (ImportError, AttributeError):
        pass

    system_prompt = build_system_prompt(
        mood=mood,
        persona=persona,
        interaction_type=interaction_type,
        voice_mode=voice_mode,
        sulky=is_sulky(),
        memories=memory_list,
        preferences=preferences,
        philosophy=philosophy,
    )

    # 상황 컨텍스트 주입 (rule-based, AI 호출 없음)
    situation: list[str] = []
    if audio_features:
        e = audio_features.get("energy", 1.0)
        if e < 0.4:
            situation.append("Voice: low energy")
        elif e > 0.9:
            situation.append("Voice: energetic")
        if audio_features.get("rising_tone"):
            situation.append("Rising tone detected")
    if visual_context:
        situation.append(f"Screen: {visual_context}")
    if session_duration > 120:
        situation.append(f"Session: {session_duration}min")
    if owner_emotion not in ("NEUTRAL", None, ""):
        situation.append(f"Owner emotion: {owner_emotion}")
    if situation:
        system_prompt += "\n\n## Current Situation\n" + "\n".join(f"- {s}" for s in situation)

    # 세션 시작 힌트 (첫 메시지에만)
    if is_first_message:
        from backend.services.session_judge import judge_session_start
        session_ctx = judge_session_start(
            first_message=message,
            audio_energy=audio_features.get("energy") if audio_features else None,
        )
        if session_ctx.system_hint:
            system_prompt += f"\n\n## Session Context\n{session_ctx.system_hint}"

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
