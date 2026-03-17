"""
대화 관련 라우터.
POST /chat  — SSE 스트리밍 대화
GET /history — 대화 메시지 목록
GET /conversations — 세션 목록
"""

import asyncio
import json
import logging
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
from backend.services.memory import search_memory, update_confidence
from backend.services.mood import get_mood

logger = logging.getLogger(__name__)

router = APIRouter()

# 하나 시스템에서 사용자 식별자 (현재는 단일 사용자)
_OWNER_USER_ID = "owner"


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


async def _get_last_assistant_time(
    db: aiosqlite.Connection, conversation_id: str
) -> Optional[datetime]:
    """마지막 assistant 메시지의 created_at을 반환한다."""
    async with db.execute(
        "SELECT created_at FROM messages "
        "WHERE conversation_id = ? AND role = 'assistant' "
        "ORDER BY created_at DESC LIMIT 1",
        (conversation_id,),
    ) as cursor:
        row = await cursor.fetchone()
    if not row:
        return None
    ts = row[0]
    # SQLite는 timezone 정보가 없을 수 있으므로 UTC로 파싱
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)


async def _save_message(
    db: aiosqlite.Connection,
    message_id: str,
    conversation_id: str,
    role: str,
    content: str,
    mood: Optional[str] = None,
    response_time_ms: Optional[int] = None,
    owner_response_delay_ms: Optional[int] = None,
) -> None:
    await db.execute(
        """
        INSERT INTO messages
            (id, conversation_id, role, content, mood_at_response,
             response_time_ms, owner_response_delay_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            message_id,
            conversation_id,
            role,
            content,
            mood,
            response_time_ms,
            owner_response_delay_ms,
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
    request_time = datetime.now(timezone.utc)
    logger.info(f"/chat request received: conversation_id={conversation_id}")

    async def event_stream():
        async with aiosqlite.connect(DB_PATH) as db:
            await _ensure_conversation(db, conversation_id)

            # 오너 응답 딜레이 계산 (마지막 assistant 메시지 기준)
            last_time = await _get_last_assistant_time(db, conversation_id)
            delay_ms = (
                int((request_time - last_time).total_seconds() * 1000)
                if last_time
                else None
            )

            user_msg_id = str(uuid.uuid4())
            await _save_message(
                db, user_msg_id, conversation_id, "user", req.message,
                owner_response_delay_ms=delay_ms,
            )

            # 대화 히스토리 로드와 메모리 검색을 병렬 수행
            history, memories = await asyncio.gather(
                _load_recent_messages(db, conversation_id),
                search_memory(_OWNER_USER_ID, req.message),
            )

            # 참조된 기억의 confidence 업데이트
            for mem in memories:
                await update_confidence(mem["id"], delta=0.1)

            # 메모리를 시스템 프롬프트에 주입할 형식으로 조합
            memory_context: Optional[str] = None
            if memories:
                memory_context = "\n".join(f"- {m['fact']}" for m in memories)

            assistant_msg_id = str(uuid.uuid4())
            full_response = []
            start_ms = int(time.time() * 1000)

            try:
                async for token in stream_chat(history, memory_context=memory_context):
                    full_response.append(token)
                    yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
            except Exception as exc:
                logger.error(f"/chat LLM error: conversation_id={conversation_id} error={exc}")
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
            logger.info(f"/chat response complete: conversation_id={conversation_id} elapsed_ms={elapsed_ms}")

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
