"""
장기 메모리 서비스.
mem0로 대화에서 사실을 추출하고 memory_facts 테이블에 저장한다.
검색은 SQLite 텍스트 검색으로 수행한다 (ChromaDB RAG는 Phase 2 별도 기능).
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from backend.models.schema import DB_PATH

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen3:14b")
OLLAMA_EMBED_MODEL: str = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
CHROMA_PATH: str = os.getenv("CHROMA_PATH", "data/chroma")

_MEM0_CONFIG = {
    "llm": {
        "provider": "ollama",
        "config": {
            "model": OLLAMA_MODEL,
            "ollama_base_url": OLLAMA_BASE_URL,
        },
    },
    "embedder": {
        "provider": "ollama",
        "config": {
            "model": OLLAMA_EMBED_MODEL,
            "ollama_base_url": OLLAMA_BASE_URL,
        },
    },
    "vector_store": {
        "provider": "chroma",
        "config": {
            "collection_name": "hana_memory",
            "path": CHROMA_PATH,
        },
    },
}

# 모듈 레벨 캐시 — 테스트에서 monkeypatch로 교체 가능
_mem0_instance = None


def _get_mem0():
    """mem0 Memory 인스턴스를 반환한다. 최초 호출 시 초기화한다."""
    global _mem0_instance
    if _mem0_instance is None:
        from mem0 import Memory as Mem0Memory  # lazy import: 테스트 시 mock 전에 import 방지
        _mem0_instance = Mem0Memory.from_config(_MEM0_CONFIG)
        logger.info("mem0 Memory initialized")
    return _mem0_instance


async def add_memory(
    user_id: str,
    message: str,
    source_message_id: Optional[str] = None,
) -> list[str]:
    """
    메시지에서 mem0로 사실을 추출하고 memory_facts 테이블에 저장한다.
    추출된 사실 목록을 반환한다.
    """
    logger.info(f"Memory extract start: user_id={user_id}")
    mem0 = _get_mem0()

    result = mem0.add(message, user_id=user_id)
    # mem0 응답 형식: {"results": [{"memory": "...", "event": "ADD"|"UPDATE"|"NONE"}]}
    facts = [
        r["memory"]
        for r in result.get("results", [])
        if r.get("event") in ("ADD", "UPDATE") and r.get("memory")
    ]

    if facts:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(DB_PATH) as db:
            for fact in facts:
                await db.execute(
                    """
                    INSERT INTO memory_facts (id, fact, source_message_id, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (str(uuid.uuid4()), fact, source_message_id, now),
                )
            await db.commit()

    logger.info(f"Memory extract complete: user_id={user_id} fact_count={len(facts)}")
    return facts


async def search_memory(
    user_id: str,
    query: str,
    limit: int = 5,
) -> list[dict]:
    """
    query의 키워드로 memory_facts를 검색한다.
    confidence 높은 순으로 반환한다.
    """
    # 쿼리를 공백으로 분리해서 각 단어가 포함된 사실을 검색
    words = query.split()
    if not words:
        return []

    # 각 단어에 대해 LIKE 조건을 OR로 연결
    conditions = " OR ".join(["fact LIKE ?" for _ in words])
    params = [f"%{w}%" for w in words] + [limit]

    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            f"""
            SELECT id, fact, confidence
            FROM memory_facts
            WHERE ({conditions}) AND confidence > 0.1
            ORDER BY confidence DESC
            LIMIT ?
            """,
            params,
        ) as cursor:
            rows = await cursor.fetchall()

    facts = [{"id": r[0], "fact": r[1], "confidence": r[2]} for r in rows]
    logger.info(f"Memory search complete: query={query!r} result_count={len(facts)}")
    return facts


async def update_confidence(fact_id: str, delta: float) -> None:
    """참조 시 confidence를 높이고 reference_count와 last_referenced를 갱신한다."""
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE memory_facts
            SET confidence = MIN(1.0, confidence + ?),
                reference_count = reference_count + 1,
                last_referenced = ?
            WHERE id = ?
            """,
            (delta, now, fact_id),
        )
        await db.commit()
