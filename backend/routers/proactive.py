"""
능동 알림 주기 제어 라우터.
POST /proactive/check   — 이벤트 발생 전 주기 체크 + 로그 기록
POST /proactive/ignored — 오너 무시 기록
GET  /proactive/status  — 오늘 능동 알림 현황 조회
"""

import logging
from datetime import datetime

import aiosqlite
from fastapi import APIRouter
from pydantic import BaseModel

from backend.models.schema import DB_PATH
from backend.services.proactive_service import (
    DAILY_MAX,
    can_trigger,
    log_trigger,
    mark_ignored,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class CheckRequest(BaseModel):
    event_type: str


class IgnoredRequest(BaseModel):
    log_id: str


@router.post("/proactive/check")
async def proactive_check(req: CheckRequest) -> dict:
    """
    이벤트 발생 가능 여부를 확인한다.
    가능하면 log_id를 기록하고 반환한다.
    불가능하면 reason을 반환한다.
    """
    allowed = await can_trigger(req.event_type)
    if not allowed:
        logger.info("/proactive/check: event=%s can_trigger=False", req.event_type)
        return {"can_trigger": False, "reason": "already_triggered_today"}
    log_id = await log_trigger(req.event_type)
    logger.info(
        "/proactive/check: event=%s can_trigger=True log_id=%s",
        req.event_type,
        log_id,
    )
    return {"can_trigger": True, "log_id": log_id}


@router.post("/proactive/ignored")
async def proactive_ignored(req: IgnoredRequest) -> dict:
    """오너가 알림을 무시했음을 기록한다."""
    await mark_ignored(req.log_id)
    logger.info("/proactive/ignored: log_id=%s", req.log_id)
    return {"success": True}


@router.get("/proactive/status")
async def proactive_status() -> dict:
    """오늘 능동 알림 현황을 반환한다."""
    today = datetime.now().strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_PATH) as db:

        # mood_check 완료 여부
        async with db.execute(
            "SELECT id FROM proactive_log "
            "WHERE event_type = 'mood_check' AND session_date = ? LIMIT 1",
            (today,),
        ) as cur:
            mood_check_done = await cur.fetchone() is not None

        # autonomous_talk 오늘 횟수
        async with db.execute(
            "SELECT COUNT(*) FROM proactive_log "
            "WHERE event_type = 'autonomous_talk' AND session_date = ?",
            (today,),
        ) as cur:
            row = await cur.fetchone()
        autonomous_count = row[0] if row else 0

        autonomous_max = DAILY_MAX.get("autonomous_talk", 10)

        # 마지막 autonomous_talk 기준 경과 분
        async with db.execute(
            "SELECT triggered_at FROM proactive_log "
            "WHERE event_type = 'autonomous_talk' ORDER BY triggered_at DESC LIMIT 1",
        ) as cur:
            row = await cur.fetchone()
        if row:
            last_at = datetime.fromisoformat(row[0])
            last_minutes_ago: int | None = int(
                (datetime.now() - last_at).total_seconds() / 60
            )
        else:
            last_minutes_ago = None

    logger.info(
        "/proactive/status: mood_check=%s autonomous_count=%d",
        mood_check_done,
        autonomous_count,
    )
    return {
        "mood_check_done_today": mood_check_done,
        "autonomous_talk_count_today": autonomous_count,
        "autonomous_talk_remaining_today": max(0, autonomous_max - autonomous_count),
        "last_autonomous_talk_minutes_ago": last_minutes_ago,
    }
