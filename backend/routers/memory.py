"""
피드백, 무드, 장기기억 라우터.
POST /feedback                     — 피드백 저장
GET /mood                          — 현재 무드 조회
GET /memory/facts                  — 장기기억 사실 조회 (SQLite mem0)
DELETE /memory/facts/{fact_id}     — 장기기억 사실 삭제
GET /memory/longterm               — ChromaDB 장기 기억 검색
GET /experience/list               — 경험 목록 조회
GET /experience/preferences        — 선호/가치 목록 조회
GET /experience/philosophical      — 철학적 질문 목록 조회
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


# ---------------------------------------------------------------------------
# ChromaDB 장기 기억
# ---------------------------------------------------------------------------

@router.get("/memory/longterm")
async def get_longterm_memory(query: str = "", limit: int = 10) -> dict:
    """ChromaDB 장기 기억을 유사도 검색으로 조회한다."""
    try:
        from backend.services.memory_service import search_longterm
        if query.strip():
            results = search_longterm(query, n_results=limit)
        else:
            results = search_longterm("하나", n_results=limit)
        return {"memories": results}
    except Exception as e:
        return {"memories": [], "error": str(e)}


# ---------------------------------------------------------------------------
# 경험 목록
# ---------------------------------------------------------------------------

@router.get("/experience/list")
async def get_experience_list(limit: int = 50, offset: int = 0) -> dict:
    """하나의 경험 기록 목록을 반환한다."""
    try:
        from backend.services.memory_service import get_experience_list
        items = get_experience_list(limit=limit, offset=offset)
        return {"experiences": items, "total": len(items)}
    except Exception as e:
        return {"experiences": [], "error": str(e)}


@router.delete("/experience/{experience_id}")
async def delete_experience(experience_id: str) -> dict:
    """특정 경험 기록을 삭제한다."""
    try:
        from backend.services.memory_service import _get_collection, COL_EXPERIENCE
        col = _get_collection(COL_EXPERIENCE)
        existing = col.get(ids=[experience_id])
        if not existing["ids"]:
            raise HTTPException(status_code=404, detail={
                "error": True,
                "code": "EXPERIENCE_NOT_FOUND",
                "message": "해당 경험 기록을 찾을 수 없어.",
            })
        col.delete(ids=[experience_id])
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": True, "message": str(e)})


# ---------------------------------------------------------------------------
# 선호/가치 목록
# ---------------------------------------------------------------------------

@router.get("/experience/preferences")
async def get_preferences() -> dict:
    """하나의 선호/가치 목록을 반환한다."""
    try:
        from backend.services.preference_system import preference_system
        items = await preference_system.get_all()
        return {"preferences": items}
    except Exception as e:
        return {"preferences": [], "error": str(e)}


# ---------------------------------------------------------------------------
# 철학적 질문 목록
# ---------------------------------------------------------------------------

@router.get("/experience/philosophical")
async def get_philosophical_moments() -> dict:
    """하나가 마주친 철학적 순간 목록을 반환한다."""
    try:
        from backend.services.memory_service import search_experience
        results = search_experience("[철학적 질문]", n_results=20)
        moments = [
            {
                "id": r["id"],
                "text": r["text"],
                "topic": r["metadata"].get("topic", ""),
                "revisit_count": r["metadata"].get("revisit_count", 1),
                "thought": r["metadata"].get("latest_thought") or r["metadata"].get("thought", ""),
                "created_at": r["metadata"].get("created_at", ""),
            }
            for r in results
            if r.get("metadata", {}).get("philosophical")
        ]
        moments.sort(key=lambda x: x["revisit_count"], reverse=True)
        return {"philosophical_moments": moments}
    except Exception as e:
        return {"philosophical_moments": [], "error": str(e)}
