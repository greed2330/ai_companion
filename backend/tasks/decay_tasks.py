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
        sqlite_updated = cursor.rowcount

    # ChromaDB longterm 컬렉션에도 decay 적용
    chroma_updated = 0
    try:
        from backend.services.memory_service import decay_longterm_confidence
        chroma_updated = decay_longterm_confidence(
            decay_rate=_DECAY_FACTOR,
            min_confidence=_MIN_CONFIDENCE,
        )
    except Exception as e:
        logger.warning("ChromaDB decay skipped: %s", e)

    return {"updated": sqlite_updated + chroma_updated}


@celery_app.task(name="decay_tasks.compress_volatile_memories")
def compress_volatile_memories() -> dict:
    """7일 이상 된 단기 휘발성 기억을 LLM으로 압축해 장기 기억으로 이관한다."""
    logger.info("Celery task start: compress_volatile_memories")
    try:
        result = asyncio.get_event_loop().run_until_complete(_compress_volatile())
        logger.info("Celery task complete: compress_volatile_memories compressed=%d", result["compressed"])
        return result
    except Exception as exc:
        logger.error("Celery task failure: compress_volatile_memories error=%s", exc)
        raise


async def _compress_volatile() -> dict:
    """
    7일 이상 된 단기 기억을 조회하고 LLM으로 요약해 장기 기억에 추가한다.
    처리 완료된 항목은 volatile 컬렉션에서 삭제한다.
    """
    from datetime import datetime, timedelta, timezone
    from backend.services.memory_service import (
        _get_collection, COL_VOLATILE, add_longterm,
    )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    col = _get_collection(COL_VOLATILE)
    if col.count() == 0:
        return {"compressed": 0}

    all_items = col.get(include=["documents", "metadatas"])
    old_ids: list[str] = []
    old_docs: list[str] = []

    for i, doc_id in enumerate(all_items.get("ids", [])):
        meta = all_items["metadatas"][i] if all_items.get("metadatas") else {}
        created_at = meta.get("created_at", "")
        if created_at and created_at < cutoff:
            old_ids.append(doc_id)
            doc = all_items["documents"][i] if all_items.get("documents") else ""
            old_docs.append(doc)

    if not old_docs:
        return {"compressed": 0}

    # LLM으로 압축 요약
    try:
        from backend.services.llm_router import llm_router
        combined = "\n---\n".join(old_docs[:20])  # 최대 20개
        prompt = (
            f"다음은 하나(AI)의 단기 경험 기록들이야. "
            f"핵심 감정과 상황을 2~3문장으로 요약해줘.\n\n{combined}"
        )
        summary = await llm_router.call_for_text(
            messages=[{"role": "user", "content": prompt}],
            system_prompt="You are HANA's memory compressor. Reply in Korean only.",
        )
        if summary:
            add_longterm(
                text=f"[압축된 경험] {summary}",
                metadata={"source": "volatile_compression", "confidence": 0.8},
            )
    except Exception as e:
        logger.warning("Volatile compression LLM call failed: %s", e)

    # 처리된 항목 삭제
    if old_ids:
        col.delete(ids=old_ids)

    return {"compressed": len(old_ids)}
