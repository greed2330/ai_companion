"""
대화 라우터 (thin wrapper).
비즈니스 로직은 services/chat_pipeline.py에 있다.

POST /chat        — SSE 스트리밍 대화
GET  /history     — 대화 메시지 목록
GET  /conversations — 세션 목록
POST /feedback    — 피드백 전송
"""

import logging
from typing import Optional

import aiosqlite
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.models.schema import DB_PATH
from backend.services.chat_pipeline import run_chat_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    interaction_type: Optional[str] = None   # 'coding' | 'chat' | 'game' | None
    voice_mode: bool = False
    audio_features: Optional[dict] = None    # {"energy": float, "rising_tone": bool}
    owner_emotion: Optional[str] = None      # "NEUTRAL" | "HAPPY" | "DISTRESSED"


class FeedbackRequest(BaseModel):
    message_id: str
    score: Optional[int] = None       # 1~5 (명시적 피드백)
    positive: Optional[bool] = None   # True=thumbs up, False=thumbs down
    experience_id: Optional[str] = None


@router.post("/chat")
async def chat(req: ChatRequest, background_tasks: BackgroundTasks) -> StreamingResponse:
    if not req.message.strip():
        raise HTTPException(
            status_code=400,
            detail={
                "error": True,
                "code": "EMPTY_MESSAGE",
                "message": "메시지가 비어있어.",
            },
        )
    return await run_chat_pipeline(
        message=req.message,
        conversation_id=req.conversation_id,
        interaction_type=req.interaction_type,
        voice_mode=req.voice_mode,
        audio_features=req.audio_features,
        owner_emotion=req.owner_emotion,
        background_tasks=background_tasks,
    )


@router.get("/history")
async def history(conversation_id: str, limit: int = 50) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """
            SELECT id, role, content, mood_at_response, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (conversation_id, limit),
        ) as cursor:
            rows = await cursor.fetchall()

    messages = [
        {
            "id":         r[0],
            "role":       r[1],
            "content":    r[2],
            "mood":       r[3],
            "created_at": r[4],
        }
        for r in rows
    ]
    return {"conversation_id": conversation_id, "messages": messages}


@router.get("/conversations")
async def conversations(limit: int = 20) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """
            SELECT id, started_at, session_summary
            FROM conversations
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (limit,),
        ) as cursor:
            rows = await cursor.fetchall()

    result = [
        {"id": r[0], "started_at": r[1], "session_summary": r[2]}
        for r in rows
    ]
    return {"conversations": result}


@router.post("/feedback")
async def feedback(req: FeedbackRequest) -> dict:
    """명시적 피드백을 기록한다. experience_id가 있으면 점수 업데이트 시도."""
    if req.score is not None and not (1 <= req.score <= 5):
        raise HTTPException(status_code=400, detail={"error": True, "code": "INVALID_SCORE", "message": "score는 1~5 범위여야 해."})

    # experience 점수 업데이트 스텁 (PROMPT_06에서 채워짐)
    if req.experience_id is not None:
        score = 0.9 if req.positive else 0.1
        try:
            from backend.services.experience_collector import update_experience_score  # type: ignore[import]
            await update_experience_score(req.experience_id, score)
        except (ImportError, Exception):
            pass

    # feedback 테이블에 저장
    if req.message_id:
        explicit_score: Optional[int] = req.score
        if explicit_score is None and req.positive is not None:
            explicit_score = 5 if req.positive else 1
        if explicit_score is not None:
            try:
                async with aiosqlite.connect(DB_PATH) as db:
                    await db.execute(
                        """
                        INSERT INTO feedback (message_id, explicit_score)
                        VALUES (?, ?)
                        ON CONFLICT(message_id) DO UPDATE SET explicit_score = excluded.explicit_score
                        """,
                        (req.message_id, explicit_score),
                    )
                    await db.commit()
            except Exception as e:
                logger.warning("feedback save error: %s", e)

    return {"success": True}
