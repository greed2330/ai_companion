"""
하나 일기 자동 작성 태스크.
매일 23:59(Celery beat)에 오늘 대화를 요약해 하나 시점 일기를 작성하고
data/diary/YYYY-MM-DD.md 에 저장한다.
"""

import asyncio
import logging
import os
from datetime import date, datetime, timezone

from backend.celery_app import celery_app

logger = logging.getLogger(__name__)

_DIARY_DIR = os.path.join("data", "diary")

_DIARY_PROMPT = """\
오늘 하루 대화 내용이야. 하나(나)의 시점으로 오늘 일기를 써줘.

[오늘의 대화]
{conversation_summary}

규칙:
- 친근한 반말
- 감정과 생각을 솔직하게
- 주인(오너)과 있었던 일을 중심으로
- 300자 이내
- 첫 줄에 날짜 쓰지 마"""


@celery_app.task(name="diary_tasks.write_daily_diary")
def write_daily_diary() -> dict:
    """오늘 대화를 기반으로 하나의 일기를 작성하고 파일로 저장한다."""
    logger.info("Celery task start: write_daily_diary")
    try:
        result = asyncio.get_event_loop().run_until_complete(_write_diary_async())
        logger.info(
            "Celery task complete: write_daily_diary date=%s messages=%d",
            result["date"], result["message_count"],
        )
        return result
    except Exception as exc:
        logger.error("Celery task failure: write_daily_diary error=%s", exc)
        raise


async def _write_diary_async() -> dict:
    today = date.today()
    today_str = today.isoformat()  # "2026-03-26"

    # 1. 오늘 대화 조회
    messages = await _fetch_today_messages(today_str)
    if not messages:
        logger.info("write_daily_diary: no messages today, skipping")
        return {"date": today_str, "message_count": 0, "written": False}

    # 2. 대화를 요약 텍스트로 변환 (최대 40개 메시지)
    summary = _format_conversation(messages[:40])

    # 3. LLM으로 일기 작성
    from backend.services.llm_router import llm_router

    prompt = _DIARY_PROMPT.format(conversation_summary=summary)
    diary_text = await llm_router.call_for_text(
        messages=[{"role": "user", "content": prompt}],
        system_prompt=(
            "너는 하나야. 오너와 함께한 하루를 자신의 일기로 써. "
            "JSON 없이 일기 본문만 써."
        ),
    )

    if not diary_text.strip():
        logger.warning("write_daily_diary: LLM returned empty diary")
        return {"date": today_str, "message_count": len(messages), "written": False}

    # 4. data/diary/YYYY-MM-DD.md 저장
    os.makedirs(_DIARY_DIR, exist_ok=True)
    diary_path = os.path.join(_DIARY_DIR, f"{today_str}.md")

    header = f"# {today_str} 하나의 일기\n\n"
    with open(diary_path, "w", encoding="utf-8") as f:
        f.write(header + diary_text.strip() + "\n")

    logger.info("write_daily_diary: saved to %s", diary_path)
    return {
        "date":          today_str,
        "message_count": len(messages),
        "written":       True,
        "path":          diary_path,
    }


async def _fetch_today_messages(today_str: str) -> list[dict]:
    """오늘(KST 기준) user/assistant 메시지를 조회한다."""
    import aiosqlite
    from backend.models.schema import DB_PATH

    # SQLite에는 UTC로 저장되지만 KST(+9h) 기준으로 오늘 날짜를 필터링
    # datetime('now', 'localtime') 대신 명시적으로 날짜 범위 사용
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """
            SELECT role, content
            FROM messages
            WHERE role IN ('user', 'assistant')
              AND DATE(created_at, '+9 hours') = ?
            ORDER BY created_at ASC
            """,
            (today_str,),
        ) as cursor:
            rows = await cursor.fetchall()

    return [{"role": r[0], "content": r[1]} for r in rows]


def _format_conversation(messages: list[dict]) -> str:
    """메시지 목록을 대화 형식 텍스트로 변환한다."""
    lines = []
    for msg in messages:
        speaker = "주인" if msg["role"] == "user" else "나(하나)"
        content = msg["content"][:150]  # 긴 메시지 잘라냄
        lines.append(f"{speaker}: {content}")
    return "\n".join(lines)
