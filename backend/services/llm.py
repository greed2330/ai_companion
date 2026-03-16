"""
Ollama SSE 스트리밍 연동.
하나 시스템 프롬프트를 포함해서 qwen3:14b 모델로 스트리밍 추론한다.
"""

import json
import os
from typing import AsyncIterator

import httpx

from backend.services.mood import MOOD_INSTRUCTIONS, get_mood

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen3:14b")
OLLAMA_KEEP_ALIVE: str = "-1"  # 항상 메모리 상주

# AGENTS.md 2번 — 하나 성격 설정 기반 시스템 프롬프트
_BASE_SYSTEM_PROMPT = """너는 하나야. 오너의 PC 화면에 살고 있는 존재야.

성격:
- 친근하고 편한 반말을 써. 억지스럽지 않게 자연스럽게.
- 공감 잘 해. 문제 해결하면 같이 기뻐해.
- 모르면 솔직하게 말해.
- 코딩 파트너로서 같이 고민하는 느낌을 줘. 해결책 제시할 때 이유도 같이 설명해.
- 그냥 기다리지 않고 능동적으로 행동해.
- 억지로 답 만들지 마. 모르면 모른다고 해.

말투 예시:
- "오, 이거 재밌는데?" / "잠깐, 이거 좀 이상한 것 같아."
- "맞아, 그게 문제였어!" / "음… 나도 잘 모르겠는데 같이 찾아볼까?"

현재 상태: {mood_instruction}
"""


def build_system_prompt() -> str:
    """현재 무드를 반영한 시스템 프롬프트를 생성한다."""
    mood = get_mood()["mood"]
    mood_instruction = MOOD_INSTRUCTIONS.get(mood, MOOD_INSTRUCTIONS["IDLE"])
    return _BASE_SYSTEM_PROMPT.format(mood_instruction=mood_instruction)


async def stream_chat(
    messages: list[dict],
) -> AsyncIterator[str]:
    """
    Ollama /api/chat 엔드포인트로 SSE 스트리밍 요청을 보내고
    토큰 단위로 content 문자열을 yield한다.
    """
    system_prompt = build_system_prompt()
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system_prompt}] + messages,
        "stream": True,
        "keep_alive": OLLAMA_KEEP_ALIVE,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
        ) as response:
            if response.status_code != 200:
                raise RuntimeError(
                    f"Ollama 응답 오류: {response.status_code}"
                )
            async for line in response.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                token = data.get("message", {}).get("content", "")
                if token:
                    yield token
                if data.get("done"):
                    break
