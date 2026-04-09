"""
Edge TTS 엔진 구현체.
기존 voice_output.py의 edge-tts 로직을 TTSEngine Protocol로 래핑.
"""

from __future__ import annotations

import logging
import os

from backend.services.tts_protocol import EngineInfo, TTSEngine, VoiceInfo

logger = logging.getLogger(__name__)

_KO_VOICES: list[VoiceInfo] = [
    VoiceInfo(
        id="ko-KR-SunHiNeural",
        name="SunHi (여성)",
        language="ko-KR",
        engine_id="edge_tts",
    ),
    VoiceInfo(
        id="ko-KR-InJoonNeural",
        name="InJoon (남성)",
        language="ko-KR",
        engine_id="edge_tts",
    ),
]

_ENGINE_INFO = EngineInfo(
    id="edge_tts",
    name="Edge TTS (Microsoft)",
    description="Microsoft 신경망 TTS. 인터넷 연결 필요. 별도 서버 불필요.",
    requires_internet=True,
    supports_custom_voices=False,
    voices=_KO_VOICES,
)


def _speed_to_rate(speed: float) -> str:
    """speed 배율 → edge-tts rate 문자열. 예: 1.1 → '+10%', 0.9 → '-10%'"""
    pct = round((speed - 1.0) * 100)
    return f"+{pct}%" if pct >= 0 else f"{pct}%"


def _pitch_to_hz(pitch: float) -> str:
    """pitch 배율 → edge-tts pitch 문자열 (Hz). 예: 1.05 → '+5Hz', 0.95 → '-5Hz'"""
    hz = round((pitch - 1.0) * 100)
    return f"+{hz}Hz" if hz >= 0 else f"{hz}Hz"


class EdgeTTSEngine:
    """TTSEngine Protocol 구현체 — Microsoft Edge TTS."""

    @property
    def engine_info(self) -> EngineInfo:
        return _ENGINE_INFO

    async def list_voices(self) -> list[VoiceInfo]:
        return list(_KO_VOICES)

    async def synthesize(
        self,
        text: str,
        voice_id: str = "ko-KR-SunHiNeural",
        speed: float = 1.0,
        pitch: float = 1.0,
    ) -> bytes:
        """텍스트를 MP3 바이트로 변환한다."""
        try:
            import edge_tts
        except ImportError as e:
            raise ImportError("edge-tts not installed. pip install edge-tts") from e

        rate = _speed_to_rate(speed)
        pitch_str = _pitch_to_hz(pitch)

        logger.info(
            "EdgeTTS synthesize: voice=%s len=%d rate=%s pitch=%s",
            voice_id, len(text), rate, pitch_str,
        )

        communicate = edge_tts.Communicate(text, voice_id, rate=rate, pitch=pitch_str)
        mp3_chunks: list[bytes] = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                mp3_chunks.append(chunk["data"])

        if not mp3_chunks:
            logger.warning("EdgeTTS produced no audio for text=%r", text[:30])
            return b""

        mp3_bytes = b"".join(mp3_chunks)
        logger.info("EdgeTTS done: mp3_size=%d bytes", len(mp3_bytes))
        return mp3_bytes
