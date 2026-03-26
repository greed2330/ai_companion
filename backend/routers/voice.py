"""
음성 입출력 라우터.
POST /voice/stt  — 오디오 → 텍스트 (Whisper)
POST /voice/tts  — 텍스트 → 오디오 (Kokoro)
"""

import logging

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# 모듈 레벨 import — patch 가능하도록. 실제 라이브러리가 없으면 None으로 설정.
try:
    from backend.services.voice_input import transcribe
except ImportError:
    transcribe = None  # type: ignore[assignment]

try:
    from backend.services.voice_output import synthesize
except ImportError:
    synthesize = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# STT
# ---------------------------------------------------------------------------

@router.post("/voice/stt")
async def speech_to_text(audio: UploadFile = File(...)) -> dict:
    """
    업로드된 오디오 파일을 텍스트로 변환한다.
    Content-Type: multipart/form-data, field name: audio
    """
    if transcribe is None:
        raise HTTPException(status_code=503, detail={
            "error": True,
            "code": "WHISPER_NOT_INSTALLED",
            "message": "Whisper가 설치되지 않았어. pip install openai-whisper",
        })

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail={
            "error": True,
            "code": "EMPTY_AUDIO",
            "message": "오디오 데이터가 비어 있어.",
        })

    try:
        result = await transcribe(audio_bytes, mime_type=audio.content_type or "audio/wav")
        return result
    except Exception as e:
        logger.error("STT error: %s", e)
        raise HTTPException(status_code=500, detail={
            "error": True,
            "code": "STT_FAILED",
            "message": str(e),
        })


# ---------------------------------------------------------------------------
# TTS
# ---------------------------------------------------------------------------

class TTSRequest(BaseModel):
    text: str
    mood: str = "IDLE"
    speed: float = 1.0
    pitch: float = 0.0
    energy: float = 1.0


@router.post("/voice/tts")
async def text_to_speech(req: TTSRequest) -> Response:
    """
    텍스트를 음성으로 변환해 WAV 바이너리로 반환한다.
    mood 파라미터가 있으면 tts_emotion.py로 speed/pitch/energy를 덮어씀.
    """
    if synthesize is None:
        raise HTTPException(status_code=503, detail={
            "error": True,
            "code": "KOKORO_NOT_INSTALLED",
            "message": "Kokoro TTS가 설치되지 않았어.",
        })

    if not req.text.strip():
        raise HTTPException(status_code=400, detail={
            "error": True,
            "code": "EMPTY_TEXT",
            "message": "텍스트가 비어 있어.",
        })

    # mood가 있으면 tts_emotion으로 파라미터 오버라이드
    speed, pitch, energy = req.speed, req.pitch, req.energy
    if req.mood and req.mood != "IDLE":
        try:
            from backend.services.tts_emotion import get_tts_params
            params = get_tts_params(req.mood, energy)
            speed = params.get("speed", speed)
            pitch = params.get("pitch", pitch)
            energy = params.get("energy", energy)
        except Exception:
            pass  # 감정 파라미터 실패해도 기본값으로 진행

    try:
        wav_bytes = await synthesize(req.text, speed=speed, pitch=pitch, energy=energy)
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        logger.error("TTS error: %s", e)
        raise HTTPException(status_code=500, detail={
            "error": True,
            "code": "TTS_FAILED",
            "message": str(e),
        })
