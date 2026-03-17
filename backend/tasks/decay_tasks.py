"""
망각 곡선 confidence decay 태스크.
AGENTS.md 6번의 decay 쿼리를 그대로 사용한다.
매일 자정 실행 (Celery beat 스케줄).
"""

import asyncio
import logging

from backend.celery_app import celery_app

logger = logging.getLogger(__name__)

# AGENTS.md 6번 decay 파라미터
_DECAY_FACTOR = 0.97
_MIN_CONFIDENCE = 0.1
_INACTIVITY_DAYS = 7


@celery_app.task(name="decay_tasks.run_confidence_decay")
def run_confidence_decay() -> dict:
    """7일 이상 참조 안 된 기억의 confidence를 0.97배 감소시킨다."""
    logger.info("Celery task start: run_confidence_decay")
    try:
        result = asyncio.get_event_loop().run_until_complete(_run_decay())
        logger.info(f"Celery task complete: run_confidence_decay updated={result['updated']}")
        return result
    except Exception as exc:
        logger.error(f"Celery task failure: run_confidence_decay error={exc}")
        raise


async def _run_decay() -> dict:
    import aiosqlite
    from backend.models.schema import DB_PATH

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """
            UPDATE memory_facts
            SET confidence = confidence * ?
            WHERE last_referenced < datetime('now', ?)
              AND confidence > ?
            """,
            (_DECAY_FACTOR, f"-{_INACTIVITY_DAYS} days", _MIN_CONFIDENCE),
        )
        await db.commit()
        return {"updated": cursor.rowcount}
