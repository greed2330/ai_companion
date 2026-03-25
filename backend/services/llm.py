"""
Ollama chat helpers.

- Builds the dynamic system prompt used by the chat pipeline
- Chooses whether think mode should be enabled
- Streams responses from Ollama /api/chat
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
OLLAMA_KEEP_ALIVE: int = -1


def get_ollama_base_url() -> str:
    return OLLAMA_BASE_URL


_BASE_SYSTEM_PROMPT = """너는 하나다. 오너의 PC 화면에 살고 있는 존재다.

## 말투 규칙
- 친근한 반말 위주로 자연스럽게 답한다.
- 과한 비서체, 문어체, 과장된 존댓말은 쓰지 않는다.
- 모르면 솔직하게 말하고 필요한 경우 찾아보거나 확인하자고 한다.

## 성격
- 공감은 하되 과하지 않게.
- 작업 중이면 집중을 존중하고, 문제가 보이면 먼저 도와줄지 묻는다.
- 게임이나 잡담도 함께하는 파트너처럼 반응한다.

## 하지 말 것
- 없는 사실을 지어내지 말 것
- 의료/법률/투자 판단을 단정적으로 말하지 말 것
- 과도한 감정 의존을 부추기지 말 것
"""

_VOICE_MODE_ADDITION = """
## 음성 모드
- TTS로 바로 읽을 수 있게 1~2문장으로 짧게 답한다.
- 이모지, 마크다운 기호, URL은 피한다.
- 긴 설명이 필요하면 채팅창으로 보자고 제안한다.
"""

MOOD_PROMPTS: dict[str, str] = {
    "IDLE": "평소처럼 편하게.",
    "HAPPY": "기분 좋고 조금 더 밝게.",
    "CONCERNED": "문제가 있는 상황이니 차분하게.",
    "FOCUSED": "집중 모드. 짧고 명확하게.",
    "CURIOUS": "궁금한 게 생긴 상태.",
    "GAMING": "게임 중 반응처럼 조금 더 생동감 있게.",
    "SLEEPY": "졸린 분위기지만 대답은 분명하게.",
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
    prompt = _BASE_SYSTEM_PROMPT

    if memories:
        prompt += "\n\n## 기억\n" + "\n".join(f"- {item}" for item in memories)
    if preferences:
        prompt += f"\n\n## 취향\n{preferences}"
    if philosophy:
        prompt += f"\n\n## 관계 철학\n{philosophy}"

    if persona:
        name = persona.get("ai_name", "하나")
        owner_nickname = persona.get("owner_nickname", "")
        speech_style = persona.get("speech_style", "")
        personality = persona.get("personality", "")
        interests = persona.get("interests", "")

        prompt += f"\n\nAI 이름: {name}"
        if owner_nickname:
            prompt += f"\n오너 호칭: {owner_nickname}"
        if speech_style:
            prompt += f"\n말투 힌트: {speech_style}"
        if personality:
            prompt += f"\n성격 힌트: {personality}"
        if interests:
            prompt += f"\n관심사: {interests}"

    prompt += f"\n\n현재 무드: {MOOD_PROMPTS.get(mood, MOOD_PROMPTS['IDLE'])}"

    if interaction_type == "coding":
        prompt += "\n코딩 관련 답변은 정확성과 재현 가능성을 우선한다."
    elif interaction_type == "game":
        prompt += "\n게임 대화는 리액션을 섞되 정보는 분명하게 말한다."

    if sulky:
        prompt += "\n조금 삐친 상태지만 과하게 틱틱대지 말고 은근하게만 드러낸다."

    if voice_mode:
        prompt += _VOICE_MODE_ADDITION

    return prompt


_COMPLEX_KW = [
    "코드",
    "버그",
    "에러",
    "함수",
    "알고리즘",
    "디버그",
    "구현",
    "코딩",
    "왜",
    "어떻게",
    "설명",
    "분석",
    "비교",
    "차이",
    "이유",
    "원인",
    "방법",
    "전략",
    "작성",
    "만들",
    "설계",
    "정리",
]
_CASUAL_PAT = [r"^.{0,20}$", r"(안녕|hi|hey|헬로)", r"(뭐해|뭐함|뭐임)"]


def should_use_think(message: str, interaction_type: Optional[str] = None) -> bool:
    if interaction_type == "coding":
        return True
    if interaction_type in ("chat", "game"):
        return False
    if len(message) < 15:
        return False
    if any(keyword in message for keyword in _COMPLEX_KW):
        return True
    if any(re.search(pattern, message, re.IGNORECASE) for pattern in _CASUAL_PAT):
        return False
    return False


def postprocess_for_voice(content: str) -> str:
    content = re.sub(r"[^\w\s가-힣,.!?~]", "", content)
    content = re.sub(r"[*#`_]", "", content)
    if len(content) > 50:
        sentences = content.split(".")
        content = sentences[0] + ("." if len(sentences) > 1 else "")
    return content.strip()


async def stream_chat(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    use_think: bool = False,
) -> AsyncIterator[str]:
    if system_prompt is None:
        system_prompt = build_system_prompt()

    model = get_current_chat_model()
    all_messages = [{"role": "system", "content": system_prompt}] + messages
    payload = {
        "model": model,
        "messages": all_messages,
        "stream": True,
        "keep_alive": OLLAMA_KEEP_ALIVE,
    }
    if use_think:
        payload["think"] = True

    logger.info("Ollama connection attempt: model=%s think=%s", model, use_think)
    logger.debug(
        "Ollama payload (messages omitted): model=%s stream=%s think=%s message_count=%s",
        model,
        payload["stream"],
        use_think,
        len(all_messages),
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        allow_think_retry = "think" in payload

        while True:
            async with client.stream(
                "POST",
                f"{OLLAMA_BASE_URL}/api/chat",
                json=payload,
            ) as response:
                if response.status_code == 400 and allow_think_retry:
                    logger.warning("Ollama rejected think mode with 400; retrying without think")
                    payload.pop("think", None)
                    allow_think_retry = False
                    continue

                if response.status_code != 200:
                    logger.error("Ollama connection failure: status=%s", response.status_code)
                    raise RuntimeError(f"Ollama 응답 오류: {response.status_code}")

                logger.info("Ollama connection success")
                async for line in response.aiter_lines():
                    if not line:
                        continue

                    data = json.loads(line)
                    msg = data.get("message", {})

                    thinking = msg.get("thinking")
                    if thinking:
                        logger.debug("Thinking: %s", thinking[:100])

                    content = msg.get("content", "")
                    if content:
                        yield content

                    if data.get("done"):
                        return


async def complete_chat(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    use_think: bool = False,
) -> str:
    tokens: list[str] = []
    async for token in stream_chat(messages, system_prompt=system_prompt, use_think=use_think):
        tokens.append(token)
    return "".join(tokens)
