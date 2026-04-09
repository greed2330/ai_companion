"""
Fish Speech TTS 엔진 구현체.

별도 HTTP 서버(fish-speech)로 실행. 엔진은 REST 요청 클라이언트.
설치: https://github.com/fishaudio/fish-speech
환경변수: FISH_SPEECH_URL (기본: http://localhost:8080)

커스텀 목소리 파일 구조:
    data/voices/fish_speech/<voice_id>/
        voice.json      {"name": "하나 v1", "gender": "unknown"}
        reference.wav   레퍼런스 오디오 (3~30초)
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path

from backend.services.tts_protocol import EngineInfo, TTSEngine, VoiceInfo

logger = logging.getLogger(__name__)

FISH_SPEECH_URL: str = os.getenv("FISH_SPEECH_URL", "http://localhost:8080")
_VOICES_DIR = Path("data/voices/fish_speech")

_ENGINE_INFO = EngineInfo(
    id="fish_speech",
    name="Fish Speech (로컬)",
    description="로컬 AI TTS. 커스텀 목소리 지원. 별도 서버 실행 필요.",
    requires_internet=False,
    supports_custom_voices=True,
)


class FishSpeechEngine:
    """TTSEngine Protocol 구현체 — Fish Speech 로컬 서버."""

    @property
    def engine_info(self) -> EngineInfo:
        return _ENGINE_INFO

    async def is_available(self) -> bool:
        """Fish Speech 서버 health check. 1초 타임아웃."""
        try:
            import httpx
            async with httpx.AsyncClient(timeout=1.0) as client:
                resp = await client.get(f"{FISH_SPEECH_URL}/health")
                return resp.status_code == 200
        except Exception:
            return False

    async def list_voices(self) -> list[VoiceInfo]:
        """data/voices/fish_speech/ 디렉토리를 스캔해 커스텀 목소리 목록을 반환한다."""
        if not _VOICES_DIR.exists():
            return []
        voices: list[VoiceInfo] = []
        for voice_dir in sorted(_VOICES_DIR.iterdir()):
            if not voice_dir.is_dir():
                continue
            json_path = voice_dir / "voice.json"
            wav_path = voice_dir / "reference.wav"
            if not (json_path.exists() and wav_path.exists()):
                continue
            try:
                meta = json.loads(json_path.read_text(encoding="utf-8"))
                voices.append(VoiceInfo(
                    id=voice_dir.name,
                    name=meta.get("name", voice_dir.name),
                    language="ko-KR",
                    engine_id="fish_speech",
                    is_custom=True,
                ))
            except Exception as e:
                logger.warning("FishSpeech: failed to load voice %s: %s", voice_dir.name, e)
        return voices

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        pitch: float = 1.0,
    ) -> bytes:
        """Fish Speech 서버에 합성 요청을 보낸다."""
        ref_path = _VOICES_DIR / voice_id / "reference.wav"
        if not ref_path.exists():
            raise ValueError(f"Reference audio not found for voice: {voice_id!r}")

        import httpx
        import aiofiles  # type: ignore[import]

        async with aiofiles.open(ref_path, "rb") as f:
            ref_bytes = await f.read()

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{FISH_SPEECH_URL}/v1/tts",
                files={"reference_audio": ("reference.wav", ref_bytes, "audio/wav")},
                data={"text": text, "speed": str(speed)},
            )
            resp.raise_for_status()
            return resp.content

    async def add_voice(
        self,
        audio_bytes: bytes,
        name: str,
        voice_id: str,
    ) -> VoiceInfo:
        """새 커스텀 목소리를 추가한다.

        Args:
            audio_bytes: WAV/MP3 바이너리
            name:        표시 이름
            voice_id:    디렉토리 이름 (영숫자 + 하이픈)
        """
        voice_dir = _VOICES_DIR / voice_id
        if voice_dir.exists():
            raise FileExistsError(f"Voice already exists: {voice_id!r}")
        voice_dir.mkdir(parents=True)
        (voice_dir / "reference.wav").write_bytes(audio_bytes)
        meta = {"name": name, "gender": "unknown"}
        (voice_dir / "voice.json").write_text(
            json.dumps(meta, ensure_ascii=False), encoding="utf-8"
        )
        logger.info("FishSpeech: added custom voice voice_id=%s", voice_id)
        return VoiceInfo(
            id=voice_id,
            name=name,
            language="ko-KR",
            engine_id="fish_speech",
            is_custom=True,
        )

    async def delete_voice(self, voice_id: str) -> None:
        """커스텀 목소리를 삭제한다."""
        voice_dir = _VOICES_DIR / voice_id
        if not voice_dir.exists():
            raise FileNotFoundError(f"Voice not found: {voice_id!r}")
        shutil.rmtree(voice_dir)
        logger.info("FishSpeech: deleted custom voice voice_id=%s", voice_id)
