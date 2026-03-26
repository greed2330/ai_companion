"""
음성 출력 서비스 (TTS).
Kokoro TTS로 텍스트 → WAV 바이트 변환.
실제 kokoro 없을 때는 ImportError를 그대로 올려서 라우터에서 503으로 처리.
"""

import io
import logging
import os

logger = logging.getLogger(__name__)

# Kokoro 기본 목소리: 한국어 여성 목소리
KOKORO_VOICE: str = os.getenv("KOKORO_VOICE", "kf_bella")  # 한국어 여성 목소리


async def synthesize(
    text: str,
    speed: float = 1.0,
    pitch: float = 0.0,
    energy: float = 1.0,
) -> bytes:
    """
    텍스트를 WAV 바이트로 변환한다.

    Parameters
    ----------
    text   : 합성할 텍스트
    speed  : 재생 속도 배율 (1.0 = 기본)
    pitch  : 피치 오프셋 (0.0 = 기본, 현재 Kokoro에서 무시)
    energy : 에너지/볼륨 배율 (1.0 = 기본, 현재 Kokoro에서 무시)

    Returns
    -------
    WAV 바이너리 bytes
    """
    try:
        from kokoro import KPipeline  # pip install kokoro
    except ImportError:
        raise ImportError("kokoro not installed. pip install kokoro")

    logger.info("TTS synthesize start: len=%d speed=%.2f", len(text), speed)

    # KPipeline: lang_code='a' (영어/범용), 'j' (일본어), 'z' (중국어)
    # 한국어 전용 모델이 없으면 'a' 사용. 추후 한국어 모델 지원 시 lang_code 변경.
    pipeline = KPipeline(lang_code="k")

    # speed는 KPipeline의 speed 파라미터로 전달
    wav_chunks = []
    generator = pipeline(text, voice=KOKORO_VOICE, speed=speed, split_pattern=r"\n+")
    for _gs, _ps, audio in generator:
        wav_chunks.append(audio)

    if not wav_chunks:
        logger.warning("TTS produced no audio chunks for text=%r", text[:30])
        return _empty_wav()

    # numpy 배열 → WAV bytes
    import numpy as np
    import soundfile as sf  # pip install soundfile

    combined = np.concatenate(wav_chunks) if len(wav_chunks) > 1 else wav_chunks[0]

    buf = io.BytesIO()
    sf.write(buf, combined, samplerate=24000, format="WAV")
    wav_bytes = buf.getvalue()

    logger.info("TTS synthesize done: wav_size=%d bytes", len(wav_bytes))
    return wav_bytes


def _empty_wav() -> bytes:
    """샘플이 없을 때 반환할 최소 빈 WAV 파일."""
    import numpy as np
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, np.zeros(1, dtype=np.float32), samplerate=24000, format="WAV")
    return buf.getvalue()
