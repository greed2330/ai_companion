"""
음성 입출력 라우터.
POST /voice/stt — WAV 파일 → 텍스트
POST /voice/tts — 텍스트 → WAV 오디오
"""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from backend.services import voice_input, voice_output
from backend.services.tts_emotion import get_tts_params

logger = logging.getLogger(__name__)
router = APIRouter()


class TTSRequest(BaseModel):
    text: str
    mood: str = "IDLE"
    speed: float | None = None  # 명시 시 mood 파라미터보다 우선


@router.post("/voice/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    """
    WAV 파일을 받아 한국어 텍스트로 변환한다.
    multipart/form-data, field name: audio
    """
    audio_bytes = await audio.read()
    logger.info("/voice/stt 요청: %d bytes", len(audio_bytes))

    try:
        text, confidence = voice_input.transcribe(audio_bytes)
        return {"text": text, "confidence": confidence}
    except Exception as e:
        logger.error("STT 실패: %s", e)
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/voice/tts")
async def text_to_speech(req: TTSRequest):
    """
    텍스트를 WAV 오디오로 변환해 반환한다.
    응답: audio/wav 바이너리
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text가 비어 있습니다.")

    if not voice_output.is_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "TTS 모델 파일이 없습니다. "
                "data/kokoro-v1_0.onnx 와 data/voices-v1_0.bin 을 다운로드하세요. "
                "https://huggingface.co/hexgrad/Kokoro-82M"
            ),
        )

    logger.info("/voice/tts 요청: %d자, mood=%s", len(req.text), req.mood)
    params = get_tts_params(req.mood)
    speed = req.speed if req.speed is not None else params["speed"]

    try:
        wav_bytes = voice_output.synthesize(req.text, speed=speed)
        return Response(content=wav_bytes, media_type="audio/wav")
    except FileNotFoundError as e:
        logger.error("TTS 모델 파일 없음: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("TTS 실패: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
