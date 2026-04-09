"""
음성 입력 서비스 (STT).
WhisperSTTEngine을 통해 오디오 → 텍스트 변환을 처리한다.

엔진 교체: WhisperSTTEngine 대신 다른 STTEngine 구현체로 교체하면
          이 파일 수정 없이 전환됨.
"""

from backend.services.stt_whisper import WhisperSTTEngine

_engine = WhisperSTTEngine()


async def transcribe(audio_bytes: bytes, mime_type: str = "audio/wav") -> dict:
    """
    오디오 바이트를 텍스트로 변환한다.
    routers/voice.py → 이 함수 → WhisperSTTEngine 순으로 위임됨.

    Returns
    -------
    {"text": str, "confidence": float, "language": str}
    """
    result = await _engine.transcribe(audio_bytes, mime_type=mime_type)
    return {
        "text": result.text,
        "confidence": result.confidence,
        "language": result.language,
    }


def reset_model_for_test() -> None:
    """테스트 전용: Whisper 모델 캐시 초기화."""
    from backend.services.stt_whisper import reset_model_for_test as _reset
    _reset()
