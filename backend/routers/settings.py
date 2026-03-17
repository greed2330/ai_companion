"""
설정 라우터.
GET  /settings/models        — assets/character/ 스캔, 사용 가능한 Live2D 모델 목록 반환
POST /settings/models/select — 현재 모델 변경 + /mood/stream push
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.mood import push_event

logger = logging.getLogger(__name__)

router = APIRouter()

# assets/character/ 루트 경로 (레포 루트 기준)
_CHARACTER_ROOT = Path("assets/character")

# 현재 선택된 모델 ID (런타임 상태; 재시작 시 초기화됨)
_current_model_id: str | None = None


def _scan_models() -> list[dict]:
    """assets/character/ 하위에서 .model3.json 파일이 있는 폴더를 스캔한다."""
    models = []
    if not _CHARACTER_ROOT.exists():
        return models

    for entry in sorted(_CHARACTER_ROOT.iterdir()):
        if not entry.is_dir():
            continue
        # model3.json 파일 탐색 (파일명은 폴더명과 같을 수도 있고 아닐 수도 있음)
        model_files = list(entry.glob("*.model3.json"))
        if not model_files:
            continue
        model_file = model_files[0]
        models.append({
            "id": entry.name,
            "path": str(model_file).replace("\\", "/"),
            "name": entry.name.capitalize(),
        })

    return models


@router.get("/settings/models")
async def get_models() -> dict:
    """사용 가능한 캐릭터 모델 목록과 현재 선택 모델을 반환한다."""
    models = _scan_models()
    current = _current_model_id or (models[0]["id"] if models else None)
    logger.info(f"/settings/models scanned: {len(models)} models found, current={current}")
    return {"models": models, "current": current}


class SelectModelRequest(BaseModel):
    model_id: str


@router.post("/settings/models/select")
async def select_model(req: SelectModelRequest) -> dict:
    """현재 캐릭터 모델을 변경하고 mood/stream 구독자에게 알린다."""
    global _current_model_id

    models = _scan_models()
    valid_ids = {m["id"] for m in models}
    if req.model_id not in valid_ids:
        raise HTTPException(status_code=404, detail={
            "error": True,
            "code": "MODEL_NOT_FOUND",
            "message": f"모델 '{req.model_id}'을 찾을 수 없어.",
        })

    _current_model_id = req.model_id
    logger.info(f"/settings/models/select: model changed to {req.model_id}")

    push_event({
        "type": "model_change",
        "model_id": req.model_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"success": True, "current": req.model_id}
