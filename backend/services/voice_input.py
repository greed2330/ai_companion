"""
음성 입력 서비스 (STT).
Whisper 로컬 모델로 WAV → 텍스트 변환.
실제 whisper 없을 때는 ImportError를 그대로 올려서 라우터에서 503으로 처리.
"""

import logging
import os
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

# 기본 모델 크기: base(빠름/가벼움) → small/medium/large 업그레이드 가능
WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")

_whisper_model = None


def _get_model():
    """Whisper 모델을 반환한다. 최초 호출 시 로드."""
    global _whisper_model
    if _whisper_model is None:
        import whisper  # pip install openai-whisper
        logger.info("Whisper model loading: size=%s", WHISPER_MODEL)
        _whisper_model = whisper.load_model(WHISPER_MODEL)
        logger.info("Whisper model loaded: size=%s", WHISPER_MODEL)
    return _whisper_model


async def transcribe(audio_bytes: bytes, mime_type: str = "audio/wav") -> dict:
    """
    오디오 바이트를 텍스트로 변환한다.

    Parameters
    ----------
    audio_bytes : 오디오 파일 바이트 (wav 권장)
    mime_type   : 오디오 MIME 타입

    Returns
    -------
    {"text": str, "confidence": float, "language": str}
    """
    model = _get_model()

    # 임시 파일에 저장 후 Whisper에 전달
    suffix = ".wav" if "wav" in mime_type else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        logger.info("STT transcribe start: size=%d bytes", len(audio_bytes))
        result = model.transcribe(
            tmp_path,
            language="ko",          # 한국어 우선
            task="transcribe",
            fp16=False,             # CPU 환경 호환
            verbose=False,
        )
        text = result.get("text", "").strip()
        # Whisper는 confidence를 직접 안 줘서 세그먼트 avg_logprob으로 추정
        segments = result.get("segments", [])
        confidence = _estimate_confidence(segments)
        lang = result.get("language", "ko")
        logger.info("STT transcribe done: text=%r confidence=%.2f", text[:30], confidence)
        return {"text": text, "confidence": confidence, "language": lang}
    finally:
        os.unlink(tmp_path)


def _estimate_confidence(segments: list) -> float:
    """세그먼트 avg_logprob 평균으로 confidence(0~1)를 추정한다."""
    if not segments:
        return 0.0
    avg = sum(s.get("avg_logprob", -1.0) for s in segments) / len(segments)
    # avg_logprob: 0에 가까울수록 좋음, -1 이하면 나쁨
    # 선형 변환: -1 → 0.0, 0 → 1.0, 클리핑
    confidence = max(0.0, min(1.0, avg + 1.0))
    return round(confidence, 3)


def reset_model_for_test() -> None:
    """테스트 전용: 모델 캐시 초기화."""
    global _whisper_model
    _whisper_model = None
