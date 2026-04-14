"""
음성 입출력 라우터.
POST /voice/stt                    — 오디오 → 텍스트 (Whisper)
POST /voice/tts                    — 텍스트 → 오디오 (현재 선택된 TTS 엔진)
GET  /voice/tts/engines            — TTS 엔진 목록 + 사용 가능 여부
POST /voice/tts/engines/select     — 엔진/목소리 변경
GET  /voice/tts/voices             — 목소리 목록
POST /voice/tts/preview            — 목소리 미리듣기
POST /voice/tts/voices/upload      — 커스텀 목소리 추가 (Fish Speech)
DELETE /voice/tts/voices/{voice_id} — 커스텀 목소리 삭제
"""

import logging
import re

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

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
        return Response(content=wav_bytes, media_type="audio/mpeg")
    except Exception as e:
        logger.error("TTS error: %s", e)
        raise HTTPException(status_code=500, detail={
            "error": True,
            "code": "TTS_FAILED",
            "message": str(e),
        })


# ---------------------------------------------------------------------------
# TTS 엔진 관리
# ---------------------------------------------------------------------------

def _slug(name: str) -> str:
    """이름을 voice_id 슬러그로 변환. 영숫자 + 하이픈만."""
    s = re.sub(r"[^a-zA-Z0-9가-힣]", "-", name).strip("-")
    s = re.sub(r"-+", "-", s)
    if not re.match(r"^[a-zA-Z0-9]", s):
        from datetime import datetime
        s = f"voice-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    return s[:40] or "voice-unknown"


@router.get("/voice/tts/engines")
async def list_tts_engines() -> dict:
    """TTS 엔진 목록과 사용 가능 여부를 반환한다."""
    from backend.services.tts_router import tts_router
    engines = await tts_router.list_engines_with_availability()
    current = tts_router.get_current()
    return {
        "engines":           engines,
        "current_engine_id": current["engine_id"],
        "current_voice_id":  current["voice_id"],
    }


class EngineSelectRequest(BaseModel):
    engine_id: str
    voice_id: Optional[str] = None


@router.post("/voice/tts/engines/select")
async def select_tts_engine(req: EngineSelectRequest) -> dict:
    """엔진(및 목소리)을 변경한다."""
    from backend.services.tts_router import tts_router
    try:
        current = await tts_router.select_engine_and_voice(req.engine_id, req.voice_id)
        return {"success": True, **current}
    except ValueError as e:
        msg = str(e)
        if msg.startswith("ENGINE_NOT_FOUND"):
            raise HTTPException(status_code=400, detail={"error": True, "code": "ENGINE_NOT_FOUND", "message": "알 수 없는 엔진이야."})
        if msg.startswith("VOICE_NOT_FOUND"):
            raise HTTPException(status_code=400, detail={"error": True, "code": "VOICE_NOT_FOUND", "message": "해당 목소리가 없어."})
        raise HTTPException(status_code=400, detail={"error": True, "code": "INVALID_REQUEST", "message": msg})
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail={"error": True, "code": "ENGINE_NOT_AVAILABLE", "message": "엔진 서버가 실행 중이지 않아."})


@router.get("/voice/tts/voices")
async def list_tts_voices(engine_id: Optional[str] = None) -> dict:
    """목소리 목록을 반환한다. engine_id 생략 시 현재 엔진 기준."""
    from backend.services.tts_router import tts_router
    try:
        voices = await tts_router.list_voices(engine_id)
        eid = engine_id or tts_router.get_current()["engine_id"]
        return {
            "engine_id": eid,
            "voices": [
                {
                    "voice_id":   v.id,
                    "name":       v.name,
                    "gender":     getattr(v, "gender", "unknown"),
                    "is_custom":  v.is_custom,
                }
                for v in voices
            ],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": True, "code": "ENGINE_NOT_FOUND", "message": str(e)})


class PreviewRequest(BaseModel):
    text: str = "안녕! 나 하나야. 잘 지냈어?"
    voice_id: str
    engine_id: Optional[str] = None


@router.post("/voice/tts/preview")
async def preview_tts_voice(req: PreviewRequest) -> Response:
    """지정 목소리로 미리듣기 오디오를 반환한다."""
    from backend.services.tts_router import tts_router
    eid = req.engine_id or tts_router.get_current()["engine_id"]
    if eid not in tts_router._engines:
        raise HTTPException(status_code=400, detail={"error": True, "code": "ENGINE_NOT_FOUND", "message": "알 수 없는 엔진이야."})
    engine = tts_router._engines[eid]
    if not await engine.is_available():
        raise HTTPException(status_code=503, detail={"error": True, "code": "ENGINE_NOT_AVAILABLE", "message": "엔진 서버가 실행 중이지 않아."})
    try:
        audio_bytes = await engine.synthesize(text=req.text, voice_id=req.voice_id)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        logger.error("TTS preview error: %s", e)
        raise HTTPException(status_code=500, detail={"error": True, "code": "TTS_FAILED", "message": str(e)})


_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB


@router.post("/voice/tts/voices/upload")
async def upload_tts_voice(
    audio: UploadFile = File(...),
    name: str = "커스텀 목소리",
    engine_id: str = "fish_speech",
) -> dict:
    """커스텀 목소리(WAV/MP3)를 Fish Speech 엔진에 추가한다."""
    from backend.services.tts_router import tts_router
    if engine_id not in tts_router._engines:
        raise HTTPException(status_code=400, detail={"error": True, "code": "ENGINE_NOT_FOUND", "message": "알 수 없는 엔진이야."})
    engine = tts_router._engines[engine_id]
    if not engine.engine_info.supports_custom_voices:
        raise HTTPException(status_code=400, detail={"error": True, "code": "CUSTOM_VOICE_NOT_SUPPORTED", "message": "이 엔진은 커스텀 목소리를 지원하지 않아."})

    audio_bytes = await audio.read()
    if len(audio_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail={"error": True, "code": "AUDIO_TOO_LARGE", "message": "파일이 너무 커. 10MB 이하로 올려줘."})

    voice_id = _slug(name)
    try:
        voice = await engine.add_voice(audio_bytes, name, voice_id)
        return {
            "success": True,
            "voice": {"voice_id": voice.id, "name": voice.name, "is_custom": voice.is_custom},
        }
    except FileExistsError:
        raise HTTPException(status_code=400, detail={"error": True, "code": "VOICE_ALREADY_EXISTS", "message": "같은 이름의 목소리가 이미 있어."})
    except Exception as e:
        logger.error("Voice upload error: %s", e)
        raise HTTPException(status_code=500, detail={"error": True, "code": "UPLOAD_FAILED", "message": str(e)})


@router.delete("/voice/tts/voices/{voice_id}")
async def delete_tts_voice(voice_id: str) -> dict:
    """커스텀 목소리를 삭제한다."""
    from backend.services.tts_router import tts_router
    current_engine = tts_router.get_current()["engine_id"]
    if current_engine not in tts_router._engines:
        raise HTTPException(status_code=400, detail={"error": True, "code": "ENGINE_NOT_FOUND", "message": "알 수 없는 엔진이야."})
    engine = tts_router._engines[current_engine]

    # is_custom 확인: list_voices에서 찾기
    voices = await engine.list_voices()
    voice = next((v for v in voices if v.id == voice_id), None)
    if voice is None:
        raise HTTPException(status_code=404, detail={"error": True, "code": "VOICE_NOT_FOUND", "message": "목소리를 찾을 수 없어."})
    if not voice.is_custom:
        raise HTTPException(status_code=400, detail={"error": True, "code": "NOT_CUSTOM_VOICE", "message": "기본 제공 목소리는 삭제할 수 없어."})

    try:
        await engine.delete_voice(voice_id)
        return {"success": True}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail={"error": True, "code": "VOICE_NOT_FOUND", "message": "목소리를 찾을 수 없어."})
    except AttributeError:
        raise HTTPException(status_code=400, detail={"error": True, "code": "CUSTOM_VOICE_NOT_SUPPORTED", "message": "이 엔진은 커스텀 목소리 삭제를 지원하지 않아."})
