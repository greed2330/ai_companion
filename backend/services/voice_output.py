"""
음성 출력 서비스 (TTS).
tts_router를 통해 현재 선택된 TTS 엔진으로 합성 요청을 위임한다.

엔진 교체: main.py lifespan에서 tts_router.register(NewEngine()) 호출 후
          tts_router.set_engine("new_engine_id") 하면 이 파일 수정 없이 전환됨.
"""

from backend.services.tts_router import tts_router


async def synthesize(
    text: str,
    speed: float = 1.0,
    pitch: float = 1.0,
    energy: float = 1.0,
) -> bytes:
    """
    텍스트를 MP3 바이트로 변환한다.
    routers/voice.py → 이 함수 → tts_router → 현재 엔진 순으로 위임됨.
    """
    return await tts_router.synthesize(text=text, speed=speed, pitch=pitch, energy=energy)
