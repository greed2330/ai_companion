"""
TTS 라우터 싱글턴.

현재 선택된 엔진/목소리를 관리하고 synthesize() 호출을 위임한다.
새 엔진 추가 시 register()로 등록하면 됨.
"""

from __future__ import annotations

import logging
import os

from backend.services.tts_protocol import EngineInfo, TTSEngine, VoiceInfo

logger = logging.getLogger(__name__)

_DEFAULT_ENGINE_ID = "edge_tts"
_DEFAULT_VOICE_ID = os.getenv("TTS_VOICE", "ko-KR-SunHiNeural")


class TTSRouter:
    """등록된 TTSEngine 중 현재 선택된 엔진으로 synthesize()를 위임하는 싱글턴."""

    def __init__(self) -> None:
        self._engines: dict[str, TTSEngine] = {}
        self._current_engine_id: str = _DEFAULT_ENGINE_ID
        self._current_voice_id: str = _DEFAULT_VOICE_ID

    # ------------------------------------------------------------------
    # 엔진 등록
    # ------------------------------------------------------------------

    def register(self, engine: TTSEngine) -> None:
        """엔진을 라우터에 등록한다. engine_info.id가 키."""
        engine_id = engine.engine_info.id
        self._engines[engine_id] = engine
        logger.info("TTSRouter: registered engine=%s", engine_id)

    # ------------------------------------------------------------------
    # 현재 선택 조회
    # ------------------------------------------------------------------

    def get_current(self) -> dict:
        """현재 선택된 엔진 ID와 목소리 ID를 반환한다."""
        return {
            "engine_id": self._current_engine_id,
            "voice_id": self._current_voice_id,
        }

    # ------------------------------------------------------------------
    # 목록 조회
    # ------------------------------------------------------------------

    def list_engines(self) -> list[EngineInfo]:
        """등록된 모든 엔진의 메타데이터를 반환한다."""
        return [e.engine_info for e in self._engines.values()]

    async def list_engines_with_availability(self) -> list[dict]:
        """등록된 엔진 목록과 사용 가능 여부를 반환한다."""
        result = []
        for engine in self._engines.values():
            info = engine.engine_info
            available = await engine.is_available()
            result.append({
                "engine_id":             info.id,
                "name":                  info.name,
                "description":           info.description,
                "requires_internet":     info.requires_internet,
                "supports_custom_voice": info.supports_custom_voices,
                "available":             available,
            })
        return result

    async def select_engine_and_voice(
        self,
        engine_id: str,
        voice_id: str | None = None,
    ) -> dict:
        """엔진(및 목소리)을 변경하고 현재 선택을 반환한다.

        Raises:
            ValueError: engine_id가 등록되지 않은 경우
            RuntimeError: 엔진이 사용 불가능한 경우
            ValueError: voice_id가 해당 엔진에 없는 경우
        """
        if engine_id not in self._engines:
            raise ValueError(f"ENGINE_NOT_FOUND:{engine_id}")
        engine = self._engines[engine_id]
        if not await engine.is_available():
            raise RuntimeError(f"ENGINE_NOT_AVAILABLE:{engine_id}")
        if voice_id:
            voices = await engine.list_voices()
            if not any(v.id == voice_id for v in voices):
                raise ValueError(f"VOICE_NOT_FOUND:{voice_id}")
            self._current_voice_id = voice_id
        else:
            voices = await engine.list_voices()
            if voices:
                self._current_voice_id = voices[0].id
        self._current_engine_id = engine_id
        self._persist()
        logger.info("TTSRouter: selected engine=%s voice=%s", engine_id, self._current_voice_id)
        return self.get_current()

    async def list_voices(self, engine_id: str | None = None) -> list[VoiceInfo]:
        """지정 엔진(또는 현재 엔진)의 목소리 목록을 반환한다."""
        engine = self._get_engine(engine_id)
        return await engine.list_voices()

    # ------------------------------------------------------------------
    # 선택 변경
    # ------------------------------------------------------------------

    def set_engine(self, engine_id: str) -> None:
        """현재 엔진을 변경한다. 등록되지 않은 ID면 ValueError."""
        if engine_id not in self._engines:
            raise ValueError(f"Unknown engine: {engine_id!r}")
        self._current_engine_id = engine_id
        logger.info("TTSRouter: engine changed to %s", engine_id)
        self._persist()

    def set_voice(self, voice_id: str) -> None:
        """현재 목소리를 변경한다."""
        self._current_voice_id = voice_id
        logger.info("TTSRouter: voice changed to %s", voice_id)
        self._persist()

    # ------------------------------------------------------------------
    # 합성
    # ------------------------------------------------------------------

    async def synthesize(
        self,
        text: str,
        speed: float = 1.0,
        pitch: float = 1.0,
        energy: float = 1.0,  # 현재 미사용, 향후 볼륨 매핑 가능
    ) -> bytes:
        """현재 선택된 엔진/목소리로 텍스트를 MP3 바이트로 변환한다."""
        engine = self._get_engine()
        return await engine.synthesize(
            text=text,
            voice_id=self._current_voice_id,
            speed=speed,
            pitch=pitch,
        )

    # ------------------------------------------------------------------
    # 내부 헬퍼
    # ------------------------------------------------------------------

    def _get_engine(self, engine_id: str | None = None) -> TTSEngine:
        eid = engine_id or self._current_engine_id
        if eid not in self._engines:
            raise ValueError(f"Engine not registered: {eid!r}")
        return self._engines[eid]

    def _persist(self) -> None:
        """현재 선택을 settings.json에 저장한다."""
        try:
            from backend.services.settings_service import _read_settings, _write_settings
            data = _read_settings()
            data["tts"] = {
                "engine_id": self._current_engine_id,
                "voice_id": self._current_voice_id,
            }
            _write_settings(data)
        except Exception as e:
            logger.warning("TTSRouter: settings persist failed: %s", e)

    def load_from_settings(self) -> None:
        """서버 시작 시 마지막 선택을 settings.json에서 복원한다."""
        try:
            from backend.services.settings_service import _read_settings
            data = _read_settings()
            tts = data.get("tts", {})
            if engine_id := tts.get("engine_id"):
                if engine_id in self._engines:
                    self._current_engine_id = engine_id
            if voice_id := tts.get("voice_id"):
                self._current_voice_id = voice_id
            logger.info(
                "TTSRouter: loaded from settings engine=%s voice=%s",
                self._current_engine_id, self._current_voice_id,
            )
        except Exception as e:
            logger.warning("TTSRouter: load_from_settings failed: %s", e)


# 싱글턴 인스턴스
tts_router = TTSRouter()
