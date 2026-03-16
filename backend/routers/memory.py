"""
피드백 및 무드 라우터.
POST /feedback — 피드백 저장
GET /mood     — 현재 무드 조회
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
