"""
LLMRouter — 다중 LLM 소스 추상화.
소스: "ollama" | "openai" | "anthropic" | "protocol" | "custom"

1st call  : stream() → 토큰 스트리밍 (오너에게 표시)
2nd call  : call_for_json() → 백그라운드 내부 상태 JSON 생성
"""

import json
import logging
import time
from typing import AsyncGenerator, Optional

import httpx

logger = logging.getLogger(__name__)


class LLMRouter:
    def __init__(self):
        self.source: str = "ollama"
        self._api_key: Optional[str] = None
        self._custom_endpoint: Optional[str] = None
        self._protocol_endpoint: Optional[str] = None
        self._protocol_connected: bool = False

    # ── 공개 API ─────────────────────────────────────────────────────────────

    async def stream(
        self,
        messages: list[dict],
        system_prompt: str,
        use_think: bool = False,
    ) -> AsyncGenerator[str, None]:
        """1st call — 오너에게 보여줄 텍스트 토큰을 스트리밍한다."""
        if self.source == "ollama":
            async for t in self._stream_ollama(messages, system_prompt, use_think):
                yield t
        elif self.source == "openai":
            async for t in self._stream_openai(messages, system_prompt):
                yield t
        elif self.source == "anthropic":
            async for t in self._stream_anthropic(messages, system_prompt):
                yield t
        elif self.source == "protocol":
            result = await self._call_protocol(messages, system_prompt)
            yield result.get("response", "")
        elif self.source == "custom":
            async for t in self._stream_custom(messages, system_prompt):
                yield t

    async def call_for_json(
        self,
        messages: list[dict],
        system_prompt: str,
    ) -> dict:
        """2nd call — 완성된 JSON dict 반환. protocol 소스는 건너뜀 (빈 dict)."""
        if self.source == "protocol":
            return {}
        full = ""
        async for t in self.stream(messages, system_prompt, use_think=False):
            full += t
        try:
            clean = full.strip()
            if "```" in clean:
                parts = clean.split("```")
                clean = parts[1][4:] if parts[1].startswith("json") else parts[1]
            return json.loads(clean.strip())
        except Exception:
            return {}

    async def call_protocol_full(
        self,
        messages: list[dict],
        system_prompt: str,
        extra_context: Optional[dict] = None,
    ) -> dict:
        """Protocol 전용: emotion 필드 포함 전체 dict 반환."""
        return await self._call_protocol(messages, system_prompt, extra_context)

    def configure(
        self,
        source: str,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
    ) -> None:
        self.source = source
        if api_key:
            self._api_key = api_key
        if endpoint:
            if source == "protocol":
                self._protocol_endpoint = endpoint
                self._protocol_connected = True
            else:
                self._custom_endpoint = endpoint

    def disconnect_protocol(self) -> None:
        self._protocol_connected = False
        self._protocol_endpoint = None

    async def test_connection(self) -> dict:
        t0 = time.time()
        try:
            result = []
            async for token in self.stream(
                [{"role": "user", "content": "안녕"}], "짧게 답해."
            ):
                result.append(token)
                if len(result) > 5:
                    break
            return {
                "success": True,
                "response_ms": int((time.time() - t0) * 1000),
                "sample": "".join(result),
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ── 내부 구현 ─────────────────────────────────────────────────────────────

    async def _stream_ollama(
        self,
        messages: list[dict],
        system_prompt: str,
        use_think: bool,
    ) -> AsyncGenerator[str, None]:
        from backend.services.settings_service import get_current_chat_model
        from backend.services.llm import get_ollama_base_url

        payload = {
            "model": get_current_chat_model(),
            "messages": [{"role": "system", "content": system_prompt}] + messages,
            "stream": True,
            "keep_alive": -1,
            "think": use_think,
        }
        logger.info(
            "LLMRouter Ollama stream: model=%s think=%s", payload["model"], use_think
        )
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{get_ollama_base_url()}/api/chat",
                json=payload,
            ) as resp:
                if resp.status_code != 200:
                    logger.error("LLMRouter Ollama error: status=%s", resp.status_code)
                    raise RuntimeError(f"Ollama 응답 오류: {resp.status_code}")
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        msg = data.get("message", {})
                        if thinking := msg.get("thinking"):
                            logger.debug("[think] %s", thinking[:100])
                        if c := msg.get("content", ""):
                            yield c
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue

    async def _stream_openai(
        self,
        messages: list[dict],
        system_prompt: str,
    ) -> AsyncGenerator[str, None]:
        try:
            import openai  # noqa: PLC0415
            stream = await openai.AsyncOpenAI(api_key=self._api_key).chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "system", "content": system_prompt}] + messages,
                stream=True,
            )
            async for chunk in stream:
                if c := chunk.choices[0].delta.content:
                    yield c
        except ImportError:
            logger.warning("openai 패키지 없음. ollama fallback.")
            async for t in self._stream_ollama(messages, system_prompt, False):
                yield t

    async def _stream_anthropic(
        self,
        messages: list[dict],
        system_prompt: str,
    ) -> AsyncGenerator[str, None]:
        try:
            import anthropic  # noqa: PLC0415
            async with anthropic.AsyncAnthropic(api_key=self._api_key).messages.stream(
                model="claude-sonnet-4-6",
                system=system_prompt,
                messages=messages,
                max_tokens=1024,
            ) as s:
                async for text in s.text_stream:
                    yield text
        except ImportError:
            logger.warning("anthropic 패키지 없음. ollama fallback.")
            async for t in self._stream_ollama(messages, system_prompt, False):
                yield t

    async def _stream_custom(
        self,
        messages: list[dict],
        system_prompt: str,
    ) -> AsyncGenerator[str, None]:
        if not self._custom_endpoint:
            async for t in self._stream_ollama(messages, system_prompt, False):
                yield t
            return
        headers = (
            {"Authorization": f"Bearer {self._api_key}"} if self._api_key else {}
        )
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                self._custom_endpoint,
                json={
                    "messages": [
                        {"role": "system", "content": system_prompt}
                    ] + messages,
                    "stream": True,
                },
                headers=headers,
            ) as resp:
                async for line in resp.aiter_lines():
                    if not line or line == "data: [DONE]":
                        continue
                    try:
                        data = json.loads(line.removeprefix("data: "))
                        if c := data["choices"][0]["delta"].get("content", ""):
                            yield c
                    except Exception:
                        continue

    async def _call_protocol(
        self,
        messages: list[dict],
        system_prompt: str,
        extra_context: Optional[dict] = None,
    ) -> dict:
        """
        Professor emotion protocol stub.
        실제 프로토콜 수신 후 이 메서드를 교체한다.
        현재는 Ollama fallback 사용.
        """
        full = ""
        async for t in self._stream_ollama(messages, system_prompt, False):
            full += t
        return {"response": full, "emotion": "IDLE", "intensity": 0.5}


# 모듈 싱글톤
llm_router = LLMRouter()
