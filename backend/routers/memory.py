"""
피드백, 무드, 장기기억 라우터.
POST /feedback         — 피드백 저장
GET /mood              — 현재 무드 조회
GET /memory/facts      — 장기기억 사실 조회
DELETE /memory/facts/{fact_id} — 장기기억 사실 삭제
"""

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.models.schema import DB_PATH
from backend.services.mood import get_mood

router = APIRouter()


class FeedbackRequest(BaseModel):
    message_id: str
    score: int  # 1~5


@router.post("/feedback")
async def feedback(req: FeedbackRequest) -> dict:
    if not (1 <= req.score <= 5):
        raise HTTPException(status_code=400, detail={
            "error": True,
            "code": "INVALID_SCORE",
            "message": "score는 1~5 사이여야 해.",
        })

    async with aiosqlite.connect(DB_PATH) as db:
        # 메시지 존재 여부 확인
        async with db.execute(
            "SELECT id FROM messages WHERE id = ?", (req.message_id,)
        ) as cursor:
            if not await cursor.fetchone():
                raise HTTPException(status_code=404, detail={
                    "error": True,
                    "code": "MESSAGE_NOT_FOUND",
                    "message": "해당 메시지를 찾을 수 없어.",
                })

        await db.execute(
            """
            INSERT INTO feedback (message_id, explicit_score)
            VALUES (?, ?)
            ON CONFLICT(message_id) DO UPDATE SET explicit_score = excluded.explicit_score
            """,
            (req.message_id, req.score),
        )
        await db.commit()

    return {"success": True}


@router.get("/mood")
async def mood() -> dict:
    return get_mood()


@router.get("/memory/facts")
async def get_memory_facts(query: str = "", limit: int = 5) -> dict:
    """장기기억 사실을 조회한다. query가 있으면 텍스트 검색, 없으면 최신순."""
    async with aiosqlite.connect(DB_PATH) as db:
        if query.strip():
            words = query.split()
            conditions = " OR ".join(["fact LIKE ?" for _ in words])
            params = [f"%{w}%" for w in words] + [limit]
            sql = f"""
                SELECT id, fact, confidence
                FROM memory_facts
                WHERE ({conditions}) AND confidence > 0.1
                ORDER BY confidence DESC
                LIMIT ?
            """
        else:
            params = [limit]
            sql = """
                SELECT id, fact, confidence
                FROM memory_facts
                WHERE confidence > 0.1
                ORDER BY created_at DESC
                LIMIT ?
            """

        async with db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()

    facts = [{"id": r[0], "fact": r[1], "confidence": r[2]} for r in rows]
    return {"facts": facts}


@router.delete("/memory/facts/{fact_id}")
async def delete_memory_fact(fact_id: str) -> dict:
    """특정 장기기억 사실을 삭제한다."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id FROM memory_facts WHERE id = ?", (fact_id,)
        ) as cursor:
            if not await cursor.fetchone():
                raise HTTPException(status_code=404, detail={
                    "error": True,
                    "code": "FACT_NOT_FOUND",
                    "message": "해당 기억을 찾을 수 없어.",
                })

        await db.execute("DELETE FROM memory_facts WHERE id = ?", (fact_id,))
        await db.commit()

    return {"success": True}
