"""
설정 라우터.
GET  /settings/models          — assets/character/ 스캔, Live2D + PMX 모델 목록 반환
POST /settings/models/select   — 현재 캐릭터 모델 변경 + /mood/stream push
GET  /settings/llm/models      — Ollama 설치 모델 목록 + 현재 챗 모델 반환
POST /settings/llm/select      — 챗 모델 변경
"""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.mood import push_event
from backend.services.settings_service import (
    get_current_chat_model,
    get_persona,
    set_current_chat_model,
    set_persona,
)
from backend.services.llm import build_system_prompt, complete_chat

logger = logging.getLogger(__name__)

router = APIRouter()

# assets/character/ 루트 경로 (레포 루트 기준)
_CHARACTER_ROOT = Path("assets/character")

# Ollama 역할 고정 모델 (AGENTS.md: worker/vision은 사용자 변경 불가)
_WORKER_MODEL: str = os.getenv("OLLAMA_WORKER_MODEL", "qwen3:4b")
_VISION_MODEL: str = os.getenv("OLLAMA_VISION_MODEL", "qwen3-vl:8b")
_OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# 현재 선택된 캐릭터 모델 ID (런타임 상태; 재시작 시 초기화됨)
_current_character_model_id: str | None = None


def _scan_models() -> list[dict]:
    """
    assets/character/ 하위 폴더를 스캔해서 Live2D / PMX 모델 목록을 반환한다.

    우선순위: .model3.json(live2d) > .pmx
    둘 다 없으면 해당 폴더는 건너뜀.
    """
    models = []
    if not _CHARACTER_ROOT.exists():
        return models

    for entry in sorted(_CHARACTER_ROOT.iterdir()):
        if not entry.is_dir():
            continue

        live2d_files = sorted(entry.rglob("*.model3.json"))
        if live2d_files:
            model_file = live2d_files[0]
            models.append({
                "id": entry.name,
                "path": str(model_file).replace("\\", "/"),
                "name": entry.name.capitalize(),
                "type": "live2d",
            })
            continue

        pmx_files = sorted(entry.rglob("*.pmx"))
        if pmx_files:
            model_file = pmx_files[0]
            models.append({
                "id": entry.name,
                "path": str(model_file).replace("\\", "/"),
                "name": entry.name.capitalize(),
                "type": "pmx",
            })

    return models


def _assign_role(model_id: str, current_chat_model: str) -> dict:
    """모델 ID에 역할과 current 플래그를 붙여 반환한다."""
    if model_id == _WORKER_MODEL:
        role = "worker"
    elif model_id == _VISION_MODEL:
        role = "vision"
    else:
        role = "chat"

    # 모델 display name: "qwen3:14b" → "Qwen3 14B"
    name_parts = model_id.replace(":", " ").replace("-", " ").split()
    name = " ".join(p.capitalize() for p in name_parts)

    return {
        "id": model_id,
        "name": name,
        "role": role,
        "current": model_id == current_chat_model,
    }


async def _fetch_ollama_models() -> list[str]:
    """Ollama /api/tags 를 호출해 설치된 모델 ID 목록을 반환한다."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{_OLLAMA_BASE_URL}/api/tags")
        resp.raise_for_status()
        data = resp.json()
    return [m["name"] for m in data.get("models", [])]


# ── 캐릭터 모델 엔드포인트 ─────────────────────────────────────────


@router.get("/settings/models")
async def get_character_models() -> dict:
    """사용 가능한 캐릭터 모델 목록(Live2D + PMX)과 현재 선택 모델을 반환한다."""
    models = _scan_models()
    current = _current_character_model_id or (models[0]["id"] if models else None)
    logger.info(f"/settings/models scanned: {len(models)} models found, current={current}")
    return {"models": models, "current": current}


class SelectCharacterModelRequest(BaseModel):
    model_id: str


@router.post("/settings/models/select")
async def select_character_model(req: SelectCharacterModelRequest) -> dict:
    """현재 캐릭터 모델을 변경하고 mood/stream 구독자에게 알린다."""
    global _current_character_model_id

    models = _scan_models()
    valid_ids = {m["id"] for m in models}
    if req.model_id not in valid_ids:
        raise HTTPException(status_code=404, detail={
            "error": True,
            "code": "MODEL_NOT_FOUND",
            "message": f"모델 '{req.model_id}'을 찾을 수 없어.",
        })

    _current_character_model_id = req.model_id
    logger.info(f"/settings/models/select: character model changed to {req.model_id}")

    push_event({
        "type": "model_change",
        "model_id": req.model_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "current": req.model_id}


# ── LLM 모델 엔드포인트 ───────────────────────────────────────────


@router.get("/settings/llm/models")
async def get_llm_models() -> dict:
    """Ollama에 설치된 모델 목록과 현재 챗 모델을 반환한다."""
    try:
        installed = await _fetch_ollama_models()
    except Exception as e:
        logger.error(f"Ollama /api/tags 호출 실패: {e}")
        raise HTTPException(status_code=503, detail={
            "error": True,
            "code": "OLLAMA_UNAVAILABLE",
            "message": "Ollama에 연결할 수 없어.",
        })

    current_chat = get_current_chat_model()
    models = [_assign_role(mid, current_chat) for mid in installed]

    logger.info(f"/settings/llm/models: {len(models)} models, current_chat={current_chat}")
    return {"models": models, "current_chat_model": current_chat}


class SelectLlmModelRequest(BaseModel):
    model_id: str


@router.post("/settings/llm/select")
async def select_llm_model(req: SelectLlmModelRequest) -> dict:
    """챗 모델을 변경한다. Ollama에 실제로 설치된 모델만 허용한다."""
    try:
        installed = await _fetch_ollama_models()
    except Exception as e:
        logger.error(f"Ollama /api/tags 호출 실패: {e}")
        raise HTTPException(status_code=503, detail={
            "error": True,
            "code": "OLLAMA_UNAVAILABLE",
            "message": "Ollama에 연결할 수 없어.",
        })

    if req.model_id not in installed:
        raise HTTPException(status_code=404, detail={
            "error": True,
            "code": "MODEL_NOT_FOUND",
            "message": "Model not installed in Ollama",
        })

    set_current_chat_model(req.model_id)
    logger.info(f"/settings/llm/select: chat model changed to {req.model_id}")

    return {"success": True, "current_chat_model": req.model_id}


# ── 페르소나 엔드포인트 ───────────────────────────────────────────


@router.get("/settings/persona")
async def get_persona_settings() -> dict:
    """현재 페르소나 설정을 반환한다."""
    persona = get_persona()
    logger.info("/settings/persona GET")
    return persona


class PersonaRequest(BaseModel):
    ai_name: str = "하나"
    owner_nickname: str = ""
    speech_style: str = ""
    speech_preset: str = "bright_friend"
    personality: str = ""
    personality_preset: str = "energetic"
    interests: str = ""


@router.post("/settings/persona")
async def update_persona(req: PersonaRequest) -> dict:
    """
    페르소나 설정을 변경한다. data/settings.json에 저장.
    다음 /chat 요청부터 시스템 프롬프트에 반영된다.
    """
    set_persona(req.model_dump())
    logger.info(f"/settings/persona POST: ai_name={req.ai_name}")
    return {"success": True}


class PersonaPreviewRequest(BaseModel):
    ai_name: str = "하나"
    owner_nickname: str = ""
    speech_style: str = ""
    speech_preset: str = "bright_friend"
    personality: str = ""
    personality_preset: str = "energetic"
    interests: str = ""


@router.post("/settings/persona/preview")
async def preview_persona(req: PersonaPreviewRequest) -> dict:
    """
    임시 페르소나로 LLM을 3회 호출해 말투 샘플을 반환한다.
    저장하지 않는다. think 모드 강제 비활성화.
    """
    persona = req.model_dump()
    system_prompt = build_system_prompt(mood="IDLE", persona=persona, voice_mode=False)
    test_message = [{"role": "user", "content": "안녕! 오늘 어땠어?"}]

    samples: list[str] = []
    for _ in range(3):
        try:
            response = await complete_chat(
                test_message,
                system_prompt=system_prompt,
                use_think=False,
            )
            samples.append(response.strip())
        except Exception as e:
            logger.error(f"/settings/persona/preview LLM error: {e}")
            samples.append("(응답 생성 실패)")

    logger.info(f"/settings/persona/preview: generated {len(samples)} samples")
    return {"samples": samples}
