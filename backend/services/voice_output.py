"""
음성 출력 서비스 (TTS).
edge-tts로 텍스트 → MP3 바이트 변환.

동작 방식:
  텍스트 + prosody(감정) → Microsoft Edge TTS WebSocket → MP3 스트리밍 수신

필요 패키지: pip install edge-tts
인터넷 연결 필요. API 키/과금 없음.

감정별 억양: tts_emotion.py의 speed/pitch 값을 edge-tts rate/pitch에 직접 매핑.
  speed 1.1  → rate="+10%"
  pitch 1.05 → pitch="+5Hz"
"""

import logging
import os

logger = logging.getLogger(__name__)

TTS_VOICE: str = os.getenv("TTS_VOICE", "ko-KR-SunHiNeural")


def _speed_to_rate(speed: float) -> str:
    """speed 배율 → edge-tts rate 문자열. 예: 1.1 → '+10%', 0.9 → '-10%'"""
    pct = round((speed - 1.0) * 100)
    return f"+{pct}%" if pct >= 0 else f"{pct}%"


def _pitch_to_hz(pitch: float) -> str:
    """pitch 배율 → edge-tts pitch 문자열 (Hz). 예: 1.05 → '+5Hz', 0.95 → '-5Hz'"""
    hz = round((pitch - 1.0) * 100)
    return f"+{hz}Hz" if hz >= 0 else f"{hz}Hz"


async def synthesize(
    text: str,
    speed: float = 1.0,
    pitch: float = 1.0,
    energy: float = 1.0,  # 현재 미사용 (향후 volume 매핑 가능)
) -> bytes:
    """
    텍스트를 MP3 바이트로 변환한다.

    Parameters
    ----------
    text   : 합성할 텍스트
    speed  : 재생 속도 배율 (1.0 = 기본). tts_emotion.get_tts_params()["speed"] 값.
    pitch  : 피치 배율 (1.0 = 기본). tts_emotion.get_tts_params()["pitch"] 값.
    energy : 현재 미사용.

    Returns
    -------
    MP3 바이너리 bytes
    """
    try:
        import edge_tts
    except ImportError:
        raise ImportError("edge-tts not installed. pip install edge-tts")

    rate = _speed_to_rate(speed)
    pitch_str = _pitch_to_hz(pitch)

    logger.info(
        "TTS synthesize start: voice=%s len=%d rate=%s pitch=%s",
        TTS_VOICE, len(text), rate, pitch_str,
    )

    communicate = edge_tts.Communicate(text, TTS_VOICE, rate=rate, pitch=pitch_str)
    mp3_chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            mp3_chunks.append(chunk["data"])

    if not mp3_chunks:
        logger.warning("TTS produced no audio for text=%r", text[:30])
        return b""

    mp3_bytes = b"".join(mp3_chunks)
    logger.info("TTS synthesize done: mp3_size=%d bytes", len(mp3_bytes))
    return mp3_bytes
