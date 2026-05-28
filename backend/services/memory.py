"""
장기 메모리 서비스.
mem0로 대화에서 사실을 추출하고 memory_facts 테이블에 저장한다.
검색은 mem0 시맨틱 검색으로 수행한다 (SPEC-02).
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
            "collection_name": "hana_memory_longterm",
            # memory_service.py가 data/chroma를 PersistentClient로 열어두므로
            # mem0는 별도 경로 사용 (같은 경로 = 설정 충돌로 ValueError)
            "path": CHROMA_PATH + "_mem0",
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
        logger.info("mem0 initialized: embed_model=%s", OLLAMA_EMBED_MODEL)
    return _mem0_instance


async def _upsert_memory_fact(
    mem0_id: str,
    fact: str,
    source_message_id: Optional[str],
) -> None:
    """mem0_id 기준으로 upsert. UPDATE 이벤트 시 fact 텍스트도 갱신한다."""
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id FROM memory_facts WHERE mem0_id = ?", (mem0_id,)
        ) as cursor:
            existing = await cursor.fetchone()

        if existing:
            await db.execute(
                "UPDATE memory_facts SET fact = ? WHERE mem0_id = ?",
                (fact, mem0_id),
            )
        else:
            await db.execute(
                """
                INSERT INTO memory_facts (id, mem0_id, fact, source_message_id, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), mem0_id, fact, source_message_id, now),
            )
        await db.commit()


async def add_memory(
    user_id: str,
    message: str,
    source_message_id: Optional[str] = None,
) -> list[str]:
    """
    메시지에서 mem0로 사실을 추출하고 memory_facts 테이블에 저장한다.
    추출된 사실 목록을 반환한다.
    """
    logger.info("Memory extract start: user_id=%s", user_id)
    mem0 = _get_mem0()

    result = mem0.add(message, user_id=user_id)
    # mem0 버전별 반환 형태 정규화 (search와 동일)
    result_list: list = result.get("results", []) if isinstance(result, dict) else (result or [])
    facts = []
    for r in result_list:
        if not isinstance(r, dict):
            continue
        if r.get("event") not in ("ADD", "UPDATE"):
            continue
        mem0_id = r.get("id", "")
        fact_text = r.get("memory", "")
        if not fact_text:
            continue
        facts.append(fact_text)
        if mem0_id:
            await _upsert_memory_fact(mem0_id, fact_text, source_message_id)

    logger.info("Memory extract complete: user_id=%s fact_count=%d", user_id, len(facts))
    return facts


async def search_memory(
    user_id: str,
    query: str,
    limit: int = 5,
) -> list[dict]:
    """
    mem0 시맨틱 검색으로 관련 기억을 반환한다.
    confidence <= 0.1인 decay 소멸 기억은 제외한다.
    """
    if not query:
        return []

    try:
        mem0 = _get_mem0()
    except Exception as e:
        logger.error("mem0 init failed — returning empty memory: %s", e)
        return []

    # limit * 2로 넉넉하게 가져와서 confidence 필터 후 자름
    raw = mem0.search(query, user_id=user_id, limit=limit * 2)
    # mem0 버전별 반환 형태 정규화:
    # v0.1.x → list[dict]  /  v0.1.98+ → {"results": list[dict], ...}
    raw_results: list = raw.get("results", []) if isinstance(raw, dict) else (raw or [])

    mem0_ids = [r.get("id") for r in raw_results if isinstance(r, dict) and r.get("id")]
    if not mem0_ids:
        return []

    # SQLite에서 confidence 일괄 조회
    placeholders = ",".join("?" * len(mem0_ids))
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            f"SELECT mem0_id, id, confidence FROM memory_facts WHERE mem0_id IN ({placeholders})",
            mem0_ids,
        ) as cursor:
            rows = await cursor.fetchall()

    confidence_map = {row[0]: (row[1], row[2]) for row in rows}

    facts = []
    for r in raw_results:
        m_id = r.get("id")
        if m_id not in confidence_map:
            # SQLite에 없는 경우 (mem0에만 존재): confidence 기본값 1.0으로 포함
            facts.append({
                "id": m_id,
                "fact": r.get("memory", ""),
                "confidence": 1.0,
            })
        else:
            fact_id, confidence = confidence_map[m_id]
            if confidence <= 0.1:
                continue  # decay로 소멸된 기억 제외
            facts.append({
                "id": fact_id,
                "fact": r.get("memory", ""),
                "confidence": confidence,
            })
        if len(facts) >= limit:
            break

    logger.info("Memory search (semantic): query=%r results=%d", query, len(facts))
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


async def delete_memory_fact(fact_id: str) -> None:
    """SQLite id 기준으로 mem0 + SQLite 양쪽 삭제한다."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT mem0_id FROM memory_facts WHERE id = ?", (fact_id,)
        ) as cursor:
            row = await cursor.fetchone()

    if row and row[0]:
        try:
            mem0 = _get_mem0()
            mem0.delete(row[0])
        except Exception as e:
            logger.warning("mem0 delete failed for mem0_id=%s: %s", row[0], e)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM memory_facts WHERE id = ?", (fact_id,))
        await db.commit()
