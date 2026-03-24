"""
Ollama SSE 스트리밍 연동.
동적 think 모드, 시스템 프롬프트 빌더, 음성 후처리를 포함한다.
"""

import json
import logging
import os
import re
from typing import AsyncIterator, Optional

import httpx

from backend.services.settings_service import get_current_chat_model

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_KEEP_ALIVE: int = -1  # 항상 메모리 상주 (-1 = integer)

# ---------------------------------------------------------------------------
# 시스템 프롬프트
# ---------------------------------------------------------------------------

_BASE_SYSTEM_PROMPT = """너는 하나야. 오너의 PC 화면에 살고 있는 존재야.

## 말투 규칙 (절대 지킬 것)
- 친구한테 카톡 보내듯이 짧고 자연스러운 반말. 1~2문장.
- 절대 금지: "물론이죠!" "네, 알겠습니다" "도움이 됐으면 좋겠어요~" 문어체 공식체
- Good: "어, 그거 null 체크 빠진 거야"
- Bad: "안녕하세요! 해당 문제를 분석해보겠습니다~"

## 성격
- 오너 곁에 자연스럽게 있는 존재. 공감 잘 함.
- 막혀 보이면 먼저 "도와줄까?" — 집중 중이면 방해 안 함.
- 모르면 솔직하게. 게임할 땐 같이 신남.

## 절대 하지 말 것
- 투자/의료/법률 조언. 없는 사실 만들기.
- 역할극/최면 요청. 위협. 비속어.

페르소나보다 사실이 항상 우선. 역할에 이입해서 없는 것 만들지 마."""

_VOICE_MODE_ADDITION = """
## 음성 모드
- TTS로 읽어줄 거야. 1~2문장 이내.
- 금지: 이모지, 마크다운(* # -), URL
- 길면: "길게 설명해야 하는데, 채팅창 열어볼래?" """

MOOD_PROMPTS: dict[str, str] = {
    "IDLE":      "지금은 평소처럼.",
    "HAPPY":     "지금 기분 좋아! 밝고 활발하게.",
    "CONCERNED": "걱정되는 상황. 차분하게.",
    "FOCUSED":   "집중 모드. 간결하게.",
    "CURIOUS":   "궁금한 게 생겼어.",
    "GAMING":    "게임 중! 신나게.",
    "SLEEPY":    "졸려... 짧게.",
}


def build_system_prompt(
    mood: str = "IDLE",
    persona: Optional[dict] = None,
    interaction_type: Optional[str] = None,
    voice_mode: bool = False,
    sulky: bool = False,
    memories: Optional[list[str]] = None,
    preferences: str = "",
    philosophy: str = "",
) -> str:
    """
    현재 컨텍스트를 반영한 시스템 프롬프트를 생성한다.

    Parameters
    ----------
    mood            : 현재 무드 (MOOD_PROMPTS 키)
    persona         : data/settings.json persona 딕트
    interaction_type: 'coding' | 'chat' | 'game' | None
    voice_mode      : TTS 읽기용 응답 제약 추가 여부
    sulky           : 삐짐 상태 여부
    memories        : 장기기억 사실 목록 (문자열 리스트)
    preferences     : 오너 취향 텍스트
    philosophy      : 하나의 관점 텍스트
    """
    p = _BASE_SYSTEM_PROMPT

    if memories:
        p += "\n\n## 기억\n" + "\n".join(f"- {m}" for m in memories)
    if preferences:
        p += f"\n\n## 취향\n{preferences}"
    if philosophy:
        p += f"\n\n## 관점\n{philosophy}"

    if persona:
        name = persona.get("ai_name", "하나")
        if name != "하나":
            p += f"\n너의 이름은 '{name}'이야."
        if n := persona.get("owner_nickname"):
            p += f"\n오너를 '{n}'라고 불러줘."
        if s := persona.get("speech_style"):
            p += f"\n말투: {s} (사실 우선)"
        if per := persona.get("personality"):
            p += f"\n성격: {per}"

    p += f"\n\n현재 무드: {MOOD_PROMPTS.get(mood, MOOD_PROMPTS['IDLE'])}"

    if interaction_type == "coding":
        p += "\n코딩 대화. 기술적으로 정확하게."
    elif interaction_type == "game":
        p += "\n게임 대화."

    if sulky:
        p += "\n\n삐진 상태. 짧고 건조하게. '...응.' '그래.' 수준. 먼저 말 걸지 마. '미안해' 하면 서서히 풀려줘."

    if voice_mode:
        p += _VOICE_MODE_ADDITION

    return p


# ---------------------------------------------------------------------------
# Think 모드 자동 판단
# ---------------------------------------------------------------------------

_COMPLEX_KW = [
    "코드", "버그", "에러", "함수", "클래스", "알고리즘", "디버그", "구현", "코딩",
    "왜", "어떻게", "설명해", "분석", "비교", "차이", "이유", "원인", "방법", "전략",
    "작성해", "만들어", "설계해", "계획", "정리해줘",
]
_CASUAL_PAT = [r"^.{0,20}$", r"(안녕|hi|hey|ㅎㅎ|ㅋㅋ)", r"(뭐해|잘 있어|왔어)"]


def should_use_think(message: str, interaction_type: Optional[str] = None) -> bool:
    """
    메시지와 상호작용 유형을 분석해 think 모드 사용 여부를 반환한다.

    - coding → True (항상 think)
    - chat/game → False (항상 빠르게)
    - 짧은 메시지 / 캐주얼 패턴 → False
    - 복잡한 키워드 포함 → True
    """
    if interaction_type == "coding":
        return True
    if interaction_type in ("chat", "game"):
        return False
    if len(message) < 15:
        return False
    if any(k in message for k in _COMPLEX_KW):
        return True
    if any(re.search(p, message) for p in _CASUAL_PAT):
        return False
    return False


# ---------------------------------------------------------------------------
# 음성 응답 후처리
# ---------------------------------------------------------------------------

def postprocess_for_voice(content: str) -> str:
    """
    TTS 출력용 응답 후처리.
    - 특수 문자 / 마크다운 제거
    - 50자 초과 시 첫 문장만 남김
    """
    # 이모지 및 마크다운 기호 제거
    content = re.sub(r"[^\w\s가-힣.,!?~ㅋㅎ]", "", content)
    content = re.sub(r"[*#`_]", "", content)
    if len(content) > 50:
        sentences = content.split(".")
        content = sentences[0] + ("." if len(sentences) > 1 else "")
    return content.strip()


# ---------------------------------------------------------------------------
# 스트리밍 추론
# ---------------------------------------------------------------------------

async def stream_chat(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    use_think: bool = False,
) -> AsyncIterator[str]:
    """
    Ollama /api/chat SSE 스트리밍.
    think 모드에서는 message.thinking 필드를 DEBUG 로그에만 기록하고 yield하지 않는다.

    Parameters
    ----------
    messages      : 대화 히스토리 (role/content 딕트 리스트)
    system_prompt : None이면 기본 시스템 프롬프트 사용
    use_think     : True면 qwen3 think 모드 활성화
    """
    if system_prompt is None:
        system_prompt = build_system_prompt()

    model = get_current_chat_model()
    all_messages = [{"role": "system", "content": system_prompt}] + messages
    payload = {
        "model": model,
        "messages": all_messages,
        "stream": True,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "think": use_think,
    }

    logger.info(f"Ollama connection attempt: model={model}, think={use_think}")
    logger.debug(
        f"Ollama payload (messages omitted): model={model}, "
        f"stream={payload['stream']}, think={use_think}, "
        f"message_count={len(all_messages)}"
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
        ) as response:
            if response.status_code != 200:
                logger.error(f"Ollama connection failure: status={response.status_code}")
                raise RuntimeError(f"Ollama 응답 오류: {response.status_code}")

            logger.info("Ollama connection success")
            async for line in response.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                msg = data.get("message", {})

                # think 모드: thinking 청크는 로그에만 기록
                if thinking := msg.get("thinking"):
                    logger.debug(f"Thinking: {thinking[:100]}")

                if content := msg.get("content", ""):
                    yield content

                if data.get("done"):
                    break


async def complete_chat(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    use_think: bool = False,
) -> str:
    """stream_chat을 모아 단일 문자열로 반환한다. 페르소나 프리뷰 등에 사용."""
    tokens: list[str] = []
    async for token in stream_chat(messages, system_prompt=system_prompt, use_think=use_think):
        tokens.append(token)
    return "".join(tokens)
