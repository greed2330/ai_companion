"""
Whisper STT 서비스.
WAV 오디오 bytes를 텍스트로 변환한다.

.env 설정:
  WHISPER_MODEL=base   # tiny/base/small/medium/large
                       # base: 한국어 인식 충분. RTX 4070 Ti Super 실시간 처리 가능.
"""

import logging
import os
import tempfile

logger = logging.getLogger(__name__)

_whisper_model: object | None = None


def _get_whisper() -> object:
    """Whisper 모델을 lazy-load한다."""
    global _whisper_model
    if _whisper_model is None:
        import whisper  # noqa: PLC0415

        model_name = os.getenv("WHISPER_MODEL", "base")
        logger.info("Whisper 모델 로드 중: %s", model_name)
        _whisper_model = whisper.load_model(model_name)
        logger.info("Whisper 모델 로드 완료: %s", model_name)
    return _whisper_model


def transcribe(audio_bytes: bytes) -> tuple[str, float]:
    """
    WAV bytes를 한국어 텍스트로 변환한다.

    Args:
        audio_bytes: WAV 형식 오디오 바이너리

    Returns:
        (text, confidence) 튜플
        - text: 인식된 텍스트
        - confidence: 0.0~1.0 신뢰도 (no_speech_prob 역산)
    """
    model = _get_whisper()
    logger.info("STT 변환 시작: %d bytes", len(audio_bytes))

    # Whisper는 파일 경로를 받으므로 임시 파일 사용
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        result = model.transcribe(tmp_path, language="ko")
        text: str = result["text"].strip()

        segments = result.get("segments", [])
        if segments:
            avg_no_speech = sum(
                s.get("no_speech_prob", 0.0) for s in segments
            ) / len(segments)
            confidence = round(1.0 - avg_no_speech, 3)
        else:
            confidence = 0.0

        logger.info(
            "STT 변환 완료: '%s...' (confidence=%.3f)",
            text[:40],
            confidence,
        )
        return text, confidence
    finally:
        os.unlink(tmp_path)
