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
        result = asyncio.get_event_loop().run_until_complete(_summarize(conversation_id))
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

    return {"conversation_id": conversation_id, "summary": summary}
