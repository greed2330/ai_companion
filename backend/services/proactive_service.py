"""
능동 알림 주기 제어 서비스.

핵심 원칙: "말 걸고 싶어도 참는다"
- 같은 종류 알림 하루 1회 제한
- 최소 간격 미달 시 스킵
- 무시 3회 이상 → 당일 autonomous_talk 중단
"""

import logging
import uuid
from datetime import datetime, timedelta

import aiosqlite

from backend.models.schema import DB_PATH

logger = logging.getLogger(__name__)

# 하루 1회만 허용하는 이벤트
DAILY_ONCE: list[str] = [
    "night_snack",
    "late_night",
    "mood_check",
    "weather_morning",
    "special_day",
]

# 최소 간격(분). None = 세션당 1회 (오늘 날짜 기준).
INTERVAL_RULES: dict[str, int | None] = {
    "autonomous_talk": 60,
    "focus_check": 30,
    "work_time_1h": None,
    "work_time_3h": None,
    "work_time_5h": None,
}

# 하루 최대 허용 횟수
DAILY_MAX: dict[str, int] = {
    "autonomous_talk": 10,
    "focus_check": 3,
}

# 무시 횟수 임계값 — 이 이상이면 autonomous_talk 당일 중단
_IGNORE_SUPPRESS_COUNT = 3


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


async def can_trigger(event_type: str) -> bool:
    """
    주기 규칙을 모두 통과하면 True 반환.

    체크 순서:
    1. DAILY_ONCE — 오늘 이미 발생했으면 False
    2. INTERVAL_RULES — 최소 간격 미달이면 False (None = 세션당 1회)
    3. DAILY_MAX — 하루 최대 초과하면 False
    4. 무시 억제 — autonomous_talk 한정, 당일 무시 3회 이상이면 False
    """
    today = _today()
    async with aiosqlite.connect(DB_PATH) as db:

        # 1. DAILY_ONCE 체크
        if event_type in DAILY_ONCE:
            async with db.execute(
                "SELECT id FROM proactive_log "
                "WHERE event_type = ? AND session_date = ? LIMIT 1",
                (event_type, today),
            ) as cur:
                if await cur.fetchone():
                    logger.debug("can_trigger: %s already triggered today", event_type)
                    return False

        # 2. INTERVAL_RULES 체크
        if event_type in INTERVAL_RULES:
            interval = INTERVAL_RULES[event_type]
            if interval is None:
                # 세션당 1회 — 오늘 날짜 기준
                async with db.execute(
                    "SELECT id FROM proactive_log "
                    "WHERE event_type = ? AND session_date = ? LIMIT 1",
                    (event_type, today),
                ) as cur:
                    if await cur.fetchone():
                        logger.debug(
                            "can_trigger: %s already done this session", event_type
                        )
                        return False
            else:
                # 최소 간격(분) 체크
                async with db.execute(
                    "SELECT triggered_at FROM proactive_log "
                    "WHERE event_type = ? ORDER BY triggered_at DESC LIMIT 1",
                    (event_type,),
                ) as cur:
                    row = await cur.fetchone()
                if row:
                    last_at = datetime.fromisoformat(row[0])
                    elapsed_minutes = (datetime.now() - last_at).total_seconds() / 60
                    if elapsed_minutes < interval:
                        logger.debug(
                            "can_trigger: %s interval not met (%.1fm < %dm)",
                            event_type,
                            elapsed_minutes,
                            interval,
                        )
                        return False

        # 3. DAILY_MAX 체크
        if event_type in DAILY_MAX:
            async with db.execute(
                "SELECT COUNT(*) FROM proactive_log "
                "WHERE event_type = ? AND session_date = ?",
                (event_type, today),
            ) as cur:
                row = await cur.fetchone()
            count = row[0] if row else 0
            if count >= DAILY_MAX[event_type]:
                logger.debug(
                    "can_trigger: %s daily max reached (%d)", event_type, count
                )
                return False

        # 4. 무시 억제 — autonomous_talk 한정
        if event_type == "autonomous_talk":
            async with db.execute(
                "SELECT COUNT(*) FROM proactive_log "
                "WHERE was_ignored = 1 AND session_date = ?",
                (today,),
            ) as cur:
                row = await cur.fetchone()
            ignored_count = row[0] if row else 0
            if ignored_count >= _IGNORE_SUPPRESS_COUNT:
                logger.debug(
                    "can_trigger: autonomous_talk suppressed — %d ignores today",
                    ignored_count,
                )
                return False

    return True


async def log_trigger(event_type: str) -> str:
    """트리거 실행을 기록하고 log_id(UUID)를 반환한다."""
    log_id = str(uuid.uuid4())
    today = _today()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO proactive_log (id, event_type, session_date) VALUES (?, ?, ?)",
            (log_id, event_type, today),
        )
        await db.commit()
    logger.info("proactive log_trigger: type=%s id=%s", event_type, log_id)
    return log_id


async def mark_ignored(log_id: str) -> None:
    """오너가 알림을 무시했을 때 was_ignored를 True로 업데이트한다."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE proactive_log SET was_ignored = 1 WHERE id = ?",
            (log_id,),
        )
        await db.commit()
    logger.info("proactive mark_ignored: id=%s", log_id)
