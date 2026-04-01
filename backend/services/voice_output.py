"""
Kokoro-ONNX TTS 서비스.
텍스트를 WAV 오디오로 변환한다.

모델 파일 다운로드:
  https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v1_0.onnx
  https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/voices-v1_0.bin

.env 설정:
  KOKORO_MODEL_PATH=data/kokoro-v1_0.onnx
  KOKORO_VOICES_PATH=data/voices-v1_0.bin
  KOKORO_VOICE=kf_bella   # 한국어 여성 기본 음성
"""

import io
import logging
import os
import wave

import numpy as np

logger = logging.getLogger(__name__)

_SAMPLE_RATE = 24000
_kokoro: object | None = None


def _load_kokoro() -> object:
    """Kokoro 인스턴스를 lazy-load한다. 실패 시 FileNotFoundError 발생."""
    model_path = os.getenv("KOKORO_MODEL_PATH", "data/kokoro-v1_0.onnx")
    voices_path = os.getenv("KOKORO_VOICES_PATH", "data/voices-v1_0.bin")

    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Kokoro 모델 파일이 없습니다: {model_path}\n"
            "다운로드: https://huggingface.co/hexgrad/Kokoro-82M"
        )
    if not os.path.exists(voices_path):
        raise FileNotFoundError(
            f"Kokoro voices 파일이 없습니다: {voices_path}\n"
            "다운로드: https://huggingface.co/hexgrad/Kokoro-82M"
        )

    from kokoro_onnx import Kokoro  # noqa: PLC0415

    logger.info("Kokoro TTS 모델 로드 중: %s", model_path)
    instance = Kokoro(model_path, voices_path)
    logger.info("Kokoro TTS 모델 로드 완료")
    return instance


def _get_kokoro() -> object:
    global _kokoro
    if _kokoro is None:
        _kokoro = _load_kokoro()
    return _kokoro


def _numpy_to_wav(samples: np.ndarray, sample_rate: int) -> bytes:
    """float32 numpy 배열을 WAV bytes로 변환한다."""
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # int16 = 2 bytes
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


def synthesize(text: str, speed: float = 1.0, voice: str | None = None) -> bytes:
    """
    텍스트를 WAV bytes로 변환한다.

    Args:
        text:  합성할 텍스트
        speed: 말하기 속도 (0.5~2.0, 기본 1.0)
        voice: 음성 이름. None이면 KOKORO_VOICE 환경변수 사용 (기본 kf_bella)

    Returns:
        WAV 형식의 바이너리 데이터
    """
    voice = voice or os.getenv("KOKORO_VOICE", "kf_bella")
    kokoro = _get_kokoro()

    logger.info(
        "TTS 합성 시작: %d자, voice=%s, speed=%.2f", len(text), voice, speed
    )
    samples, sample_rate = kokoro.create(
        text, voice=voice, speed=speed, lang="ko"
    )
    wav_bytes = _numpy_to_wav(samples, sample_rate)
    logger.info("TTS 합성 완료: %d bytes", len(wav_bytes))
    return wav_bytes


def is_available() -> bool:
    """모델 파일이 존재해서 TTS를 사용할 수 있는지 확인한다."""
    model_path = os.getenv("KOKORO_MODEL_PATH", "data/kokoro-v1_0.onnx")
    voices_path = os.getenv("KOKORO_VOICES_PATH", "data/voices-v1_0.bin")
    return os.path.exists(model_path) and os.path.exists(voices_path)
