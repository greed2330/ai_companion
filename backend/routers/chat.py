"""
대화 관련 라우터.
POST /chat  — SSE 스트리밍 대화
GET /history — 대화 메시지 목록
GET /conversations — 세션 목록
"""

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiosqlite
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.models.schema import DB_PATH
from backend.services.llm import stream_chat
from backend.services.mood import get_mood

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


async def _ensure_conversation(db: aiosqlite.Connection, conversation_id: str) -> None:
    """conversation이 없으면 새로 생성한다."""
    async with db.execute(
        "SELECT id FROM conversations WHERE id = ?", (conversation_id,)
    ) as cursor:
        row = await cursor.fetchone()
    if not row:
        await db.execute(
            "INSERT INTO conversations (id, started_at) VALUES (?, ?)",
            (conversation_id, datetime.now(timezone.utc).isoformat()),
        )
        await db.commit()


async def _load_recent_messages(
    db: aiosqlite.Connection, conversation_id: str, limit: int = 20
) -> list[dict]:
    """최근 대화 컨텍스트를 불러온다."""
    async with db.execute(
        "SELECT role, content FROM messages "
        "WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
        (conversation_id, limit),
    ) as cursor:
        rows = await cursor.fetchall()
    # 최신순으로 가져왔으니 역순으로 반환
    return [{"role": r[0], "content": r[1]} for r in reversed(rows)]


async def _save_message(
    db: aiosqlite.Connection,
    message_id: str,
    conversation_id: str,
    role: str,
    content: str,
    mood: Optional[str] = None,
    response_time_ms: Optional[int] = None,
) -> None:
    await db.execute(
        """
        INSERT INTO messages
            (id, conversation_id, role, content, mood_at_response, response_time_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            message_id,
            conversation_id,
            role,
            content,
            mood,
            response_time_ms,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    await db.commit()


@router.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    if not req.message.strip():
        raise HTTPException(status_code=400, detail={
            "error": True,
            "code": "EMPTY_MESSAGE",
            "message": "메시지가 비어있어.",
        })

    conversation_id = req.conversation_id or str(uuid.uuid4())

    async def event_stream():
        async with aiosqlite.connect(DB_PATH) as db:
            await _ensure_conversation(db, conversation_id)

            user_msg_id = str(uuid.uuid4())
            await _save_message(db, user_msg_id, conversation_id, "user", req.message)

            history = await _load_recent_messages(db, conversation_id)
            # 방금 저장한 user 메시지는 이미 history에 포함됨

            assistant_msg_id = str(uuid.uuid4())
            full_response = []
            start_ms = int(time.time() * 1000)

            try:
                async for token in stream_chat(history):
                    full_response.append(token)
                    yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'error', 'code': 'LLM_UNAVAILABLE', 'message': str(exc)}, ensure_ascii=False)}\n\n"
                return

            elapsed_ms = int(time.time() * 1000) - start_ms
            current_mood = get_mood()["mood"]

            await _save_message(
                db,
                assistant_msg_id,
                conversation_id,
                "assistant",
                "".join(full_response),
                mood=current_mood,
                response_time_ms=elapsed_ms,
            )

            done_event = {
                "type": "done",
                "message_id": assistant_msg_id,
                "conversation_id": conversation_id,
                "mood": current_mood,
            }
            yield f"data: {json.dumps(done_event, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
            "id": r[0],
            "role": r[1],
            "content": r[2],
            "mood": r[3],
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
