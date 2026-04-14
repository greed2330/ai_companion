"""
기억 관련 Celery 태스크.
summarize_session: 세션 종료 후 대화를 요약하고 session_summary에 저장한다.
"""

import asyncio
import logging

from backend.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="memory_tasks.summarize_session")
def summarize_session(conversation_id: str) -> dict:
    """세션의 대화를 Ollama로 요약하고 conversations.session_summary에 저장한다."""
    logger.info(f"Celery task start: summarize_session conversation_id={conversation_id}")
    try:
        result = asyncio.run(_summarize(conversation_id))
        logger.info(f"Celery task complete: summarize_session conversation_id={conversation_id}")
        return result
    except Exception as exc:
        logger.error(f"Celery task failure: summarize_session conversation_id={conversation_id} error={exc}")
        raise


async def _summarize(conversation_id: str) -> dict:
    import aiosqlite
    from backend.models.schema import DB_PATH
    from backend.services.llm import stream_chat

    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
            (conversation_id,),
        ) as cursor:
            rows = await cursor.fetchall()

    if not rows:
        logger.warning(f"summarize_session: no messages found for conversation_id={conversation_id}")
        return {"conversation_id": conversation_id, "summary": None}

    conversation_text = "\n".join(f"{r[0]}: {r[1]}" for r in rows)
    prompt = f"다음 대화를 2~3문장으로 요약해줘. 하나(AI)와 오너의 대화야.\n\n{conversation_text}"

    tokens = []
    async for token in stream_chat([{"role": "user", "content": prompt}]):
        tokens.append(token)
    summary = "".join(tokens).strip()

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE conversations SET session_summary = ? WHERE id = ?",
            (summary, conversation_id),
        )
        await db.commit()

    # SPEC-06: warmth 업데이트 + identity 업데이트 + tier1 재계산
    session_min = await _get_session_duration(conversation_id)
    try:
        from backend.services.warmth_service import update_warmth_after_session
        await update_warmth_after_session(session_quality=0.7, session_duration_min=session_min)
    except Exception as e:
        logger.warning("warmth update skipped: %s", e)

    try:
        from backend.tasks.identity_tasks import update_identity
        from backend.services.hana_state_service import get_state
        state = await get_state()
        warmth = float(state.get("relationship_warmth", 0.0))
        update_identity.delay(summary or conversation_text[:500], warmth)
    except Exception as e:
        logger.warning("identity update task skipped: %s", e)

    await _update_tier1_from_sessions()

    return {"conversation_id": conversation_id, "summary": summary}


async def _get_session_duration(conversation_id: str) -> int:
    """대화의 첫 메시지와 마지막 메시지 시각 차이를 분으로 반환한다."""
    import aiosqlite
    from backend.models.schema import DB_PATH
    from datetime import datetime
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT MIN(created_at), MAX(created_at) FROM messages WHERE conversation_id = ?",
            (conversation_id,),
        ) as cursor:
            row = await cursor.fetchone()
    if not row or not row[0] or not row[1]:
        return 0
    try:
        t0 = datetime.fromisoformat(row[0])
        t1 = datetime.fromisoformat(row[1])
        return int((t1 - t0).total_seconds() / 60)
    except Exception:
        return 0


async def _update_tier1_from_sessions() -> None:
    """최근 5세션의 종료 무드 중 3회 이상 일치 무드를 Tier 1으로 승격한다."""
    import aiosqlite
    from collections import Counter
    from backend.models.schema import DB_PATH
    from backend.services.mood import _state, save_tier1_to_db

    try:
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute(
                "SELECT mood_at_response FROM messages "
                "WHERE role='assistant' AND mood_at_response IS NOT NULL "
                "ORDER BY created_at DESC LIMIT 50"
            ) as cursor:
                rows = await cursor.fetchall()

        moods = [r[0] for r in rows if r[0] and r[0] != "PENDING"]
        if len(moods) < 5:
            return

        counter = Counter(moods[:25])
        most_common, count = counter.most_common(1)[0]
        if count >= 3 and most_common != _state.tier1:
            await save_tier1_to_db(most_common, intensity=0.5)
            logger.info("tier1 updated: %s → %s", _state.tier1, most_common)
    except Exception as e:
        logger.warning("_update_tier1_from_sessions failed: %s", e)
