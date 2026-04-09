"""
Whisper STT 엔진 구현체.
기존 voice_input.py의 Whisper 로직을 STTEngine Protocol로 래핑.
"""

from __future__ import annotations

import logging
import os
import tempfile

from backend.services.stt_protocol import STTEngine, TranscribeResult

logger = logging.getLogger(__name__)

WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL", "base")

_model = None


def _get_model():
    """Whisper 모델을 반환한다. 최초 호출 시 로드 (lazy)."""
    global _model
    if _model is None:
        import whisper  # pip install openai-whisper
        logger.info("WhisperSTTEngine: loading model size=%s", WHISPER_MODEL_SIZE)
        _model = whisper.load_model(WHISPER_MODEL_SIZE)
        logger.info("WhisperSTTEngine: model loaded")
    return _model


def _estimate_confidence(segments: list) -> float:
    """세그먼트 avg_logprob 평균으로 confidence(0~1)를 추정한다."""
    if not segments:
        return 0.0
    avg = sum(s.get("avg_logprob", -1.0) for s in segments) / len(segments)
    # avg_logprob: 0에 가까울수록 좋음, -1 이하면 나쁨
    # 선형 변환: -1 → 0.0, 0 → 1.0, 클리핑
    return round(max(0.0, min(1.0, avg + 1.0)), 3)


class WhisperSTTEngine:
    """STTEngine Protocol 구현체 — OpenAI Whisper (로컬)."""

    async def transcribe(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/wav",
    ) -> TranscribeResult:
        """오디오 바이트를 텍스트로 변환한다."""
        model = _get_model()

        suffix = ".wav" if "wav" in mime_type else ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            logger.info("WhisperSTTEngine: transcribe start size=%d bytes", len(audio_bytes))
            result = model.transcribe(
                tmp_path,
                language="ko",
                task="transcribe",
                fp16=False,
                verbose=False,
            )
            text = result.get("text", "").strip()
            confidence = _estimate_confidence(result.get("segments", []))
            language = result.get("language", "ko")
            logger.info("WhisperSTTEngine: done text=%r confidence=%.2f", text[:30], confidence)
            return TranscribeResult(text=text, confidence=confidence, language=language)
        finally:
            import os as _os
            _os.unlink(tmp_path)


def reset_model_for_test() -> None:
    """테스트 전용: 모델 캐시 초기화."""
    global _model
    _model = None
