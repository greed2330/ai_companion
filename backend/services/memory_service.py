"""
ChromaDB 멀티-컬렉션 메모리 서비스.

컬렉션 구조:
- hana_memory_volatile  : 단기 휘발성 기억 (7일 후 압축)
- hana_memory_longterm  : 장기 영구 기억 (confidence decay 적용)
- hana_experience       : 경험 기록 (감정/상황/반응)
- hana_preference       : 선호/가치 누적 (임계값 도달 시 longterm 승격)
- hana_dataset          : 파인튜닝 후보 데이터

마이그레이션: 기존 hana_memory 컬렉션 → hana_memory_longterm 으로 이관.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

CHROMA_PATH: str = os.getenv("CHROMA_PATH", "data/chroma")

# 컬렉션 이름 상수
COL_VOLATILE = "hana_memory_volatile"
COL_LONGTERM = "hana_memory_longterm"
COL_EXPERIENCE = "hana_experience"
COL_PREFERENCE = "hana_preference"
COL_DATASET = "hana_dataset"

# cosine 유사도 기반 HNSW 설정
_HNSW_CONFIG = {
    "hnsw:space": "cosine",
    "hnsw:construction_ef": 100,
    "hnsw:M": 16,
}

# 장기 기억 승격 코사인 유사도 임계값 (이 이상이면 중복으로 판단)
DEDUP_THRESHOLD = 0.92

_client = None
_collections: dict = {}


def _get_client():
    """ChromaDB 클라이언트를 반환한다. 최초 호출 시 초기화."""
    global _client
    if _client is None:
        import chromadb
        os.makedirs(CHROMA_PATH, exist_ok=True)
        _client = chromadb.PersistentClient(path=CHROMA_PATH)
        logger.info("ChromaDB client initialized: path=%s", CHROMA_PATH)
    return _client


def _get_collection(name: str):
    """컬렉션을 가져오거나 생성한다."""
    if name not in _collections:
        client = _get_client()
        _collections[name] = client.get_or_create_collection(
            name=name,
            metadata=_HNSW_CONFIG,
        )
        logger.info("ChromaDB collection ready: %s", name)
    return _collections[name]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# 기존 hana_memory 마이그레이션
# ---------------------------------------------------------------------------

def migrate_legacy_collection() -> int:
    """
    기존 hana_memory 컬렉션의 항목을 hana_memory_longterm으로 이관한다.
    이미 이관된 항목은 건너뜀. 이관된 항목 수를 반환한다.
    """
    client = _get_client()
    try:
        legacy = client.get_collection("hana_memory")
    except Exception:
        # 기존 컬렉션 없음 — 신규 설치
        return 0

    longterm = _get_collection(COL_LONGTERM)
    items = legacy.get(include=["documents", "metadatas", "embeddings"])
    migrated = 0

    ids = items.get("ids", [])
    docs = items.get("documents") or []
    metas = items.get("metadatas") or []
    embeddings = items.get("embeddings") or []

    for i, doc_id in enumerate(ids):
        # 이미 longterm에 있으면 건너뜀
        existing = longterm.get(ids=[doc_id])
        if existing["ids"]:
            continue
        meta = metas[i] if i < len(metas) else {}
        meta.setdefault("migrated_from", "hana_memory")
        meta.setdefault("confidence", 1.0)
        doc = docs[i] if i < len(docs) else ""
        emb = embeddings[i] if embeddings and i < len(embeddings) else None

        kwargs: dict = {
            "ids": [doc_id],
            "documents": [doc],
            "metadatas": [meta],
        }
        if emb is not None:
            kwargs["embeddings"] = [emb]
        longterm.add(**kwargs)
        migrated += 1

    if migrated:
        logger.info("Migrated %d items from hana_memory → hana_memory_longterm", migrated)
    return migrated


# ---------------------------------------------------------------------------
# Volatile 기억 (단기)
# ---------------------------------------------------------------------------

def add_volatile(
    text: str,
    metadata: Optional[dict] = None,
    doc_id: Optional[str] = None,
) -> str:
    """단기 휘발성 기억에 추가한다. 생성된 ID를 반환한다."""
    col = _get_collection(COL_VOLATILE)
    doc_id = doc_id or str(uuid.uuid4())
    meta = metadata or {}
    meta.setdefault("created_at", _now_iso())
    col.add(ids=[doc_id], documents=[text], metadatas=[meta])
    logger.debug("Volatile memory added: id=%s", doc_id)
    return doc_id


def search_volatile(query: str, n_results: int = 5) -> list[dict]:
    """단기 기억에서 유사도 검색한다."""
    col = _get_collection(COL_VOLATILE)
    if col.count() == 0:
        return []
    results = col.query(
        query_texts=[query],
        n_results=min(n_results, col.count()),
        include=["documents", "metadatas", "distances"],
    )
    return _format_results(results)


# ---------------------------------------------------------------------------
# Longterm 기억 (장기)
# ---------------------------------------------------------------------------

def add_longterm(
    text: str,
    metadata: Optional[dict] = None,
    doc_id: Optional[str] = None,
) -> str:
    """장기 기억에 추가한다. 중복(cosine > DEDUP_THRESHOLD) 시 건너뜀."""
    col = _get_collection(COL_LONGTERM)
    # 중복 체크
    if col.count() > 0:
        results = col.query(
            query_texts=[text],
            n_results=1,
            include=["distances"],
        )
        distances = results.get("distances", [[]])[0]
        if distances and distances[0] < (1.0 - DEDUP_THRESHOLD):
            # cosine distance가 낮을수록 유사도 높음
            logger.debug("Longterm memory dedup skipped (similar exists)")
            return ""

    doc_id = doc_id or str(uuid.uuid4())
    meta = metadata or {}
    meta.setdefault("created_at", _now_iso())
    meta.setdefault("confidence", 1.0)
    col.add(ids=[doc_id], documents=[text], metadatas=[meta])
    logger.debug("Longterm memory added: id=%s", doc_id)
    return doc_id


def search_longterm(query: str, n_results: int = 5) -> list[dict]:
    """장기 기억에서 유사도 검색한다."""
    col = _get_collection(COL_LONGTERM)
    if col.count() == 0:
        return []
    results = col.query(
        query_texts=[query],
        n_results=min(n_results, col.count()),
        include=["documents", "metadatas", "distances"],
    )
    return _format_results(results)


def update_longterm_confidence(doc_id: str, delta: float) -> None:
    """참조 시 장기 기억의 confidence를 갱신한다."""
    col = _get_collection(COL_LONGTERM)
    existing = col.get(ids=[doc_id], include=["metadatas"])
    if not existing["ids"]:
        return
    meta = existing["metadatas"][0]
    meta["confidence"] = min(1.0, float(meta.get("confidence", 1.0)) + delta)
    meta["last_referenced"] = _now_iso()
    col.update(ids=[doc_id], metadatas=[meta])


def decay_longterm_confidence(decay_rate: float = 0.97, min_confidence: float = 0.1) -> int:
    """
    7일 이상 참조되지 않은 장기 기억의 confidence를 감소시킨다.
    처리된 항목 수를 반환한다.
    """
    from datetime import timedelta
    col = _get_collection(COL_LONGTERM)
    if col.count() == 0:
        return 0

    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    all_items = col.get(include=["metadatas"])
    updated = 0

    for i, doc_id in enumerate(all_items.get("ids", [])):
        meta = all_items["metadatas"][i]
        last_ref = meta.get("last_referenced", meta.get("created_at", ""))
        if last_ref and last_ref < cutoff:
            current = float(meta.get("confidence", 1.0))
            if current > min_confidence:
                meta["confidence"] = max(min_confidence, current * decay_rate)
                col.update(ids=[doc_id], metadatas=[meta])
                updated += 1

    logger.info("Longterm confidence decay: updated=%d", updated)
    return updated


# ---------------------------------------------------------------------------
# Experience 기록
# ---------------------------------------------------------------------------

def add_experience(
    text: str,
    metadata: Optional[dict] = None,
    doc_id: Optional[str] = None,
) -> str:
    """경험을 기록한다."""
    col = _get_collection(COL_EXPERIENCE)
    doc_id = doc_id or str(uuid.uuid4())
    meta = metadata or {}
    meta.setdefault("created_at", _now_iso())
    col.add(ids=[doc_id], documents=[text], metadatas=[meta])
    logger.debug("Experience recorded: id=%s", doc_id)
    return doc_id


def search_experience(query: str, n_results: int = 5) -> list[dict]:
    """경험에서 유사도 검색한다."""
    col = _get_collection(COL_EXPERIENCE)
    if col.count() == 0:
        return []
    results = col.query(
        query_texts=[query],
        n_results=min(n_results, col.count()),
        include=["documents", "metadatas", "distances"],
    )
    return _format_results(results)


def get_experience_list(limit: int = 50, offset: int = 0) -> list[dict]:
    """경험 목록을 created_at 역순으로 반환한다."""
    col = _get_collection(COL_EXPERIENCE)
    if col.count() == 0:
        return []
    items = col.get(include=["documents", "metadatas"])
    results = []
    for i, doc_id in enumerate(items.get("ids", [])):
        results.append({
            "id": doc_id,
            "text": items["documents"][i] if items.get("documents") else "",
            "metadata": items["metadatas"][i] if items.get("metadatas") else {},
        })
    # created_at 역순 정렬
    results.sort(key=lambda x: x["metadata"].get("created_at", ""), reverse=True)
    return results[offset: offset + limit]


# ---------------------------------------------------------------------------
# Preference 기록
# ---------------------------------------------------------------------------

def add_preference(
    text: str,
    metadata: Optional[dict] = None,
    doc_id: Optional[str] = None,
) -> str:
    """선호/가치 신호를 기록한다."""
    col = _get_collection(COL_PREFERENCE)
    doc_id = doc_id or str(uuid.uuid4())
    meta = metadata or {}
    meta.setdefault("created_at", _now_iso())
    meta.setdefault("count", 1)
    col.add(ids=[doc_id], documents=[text], metadatas=[meta])
    return doc_id


def search_preference(query: str, n_results: int = 10) -> list[dict]:
    """선호에서 유사도 검색한다."""
    col = _get_collection(COL_PREFERENCE)
    if col.count() == 0:
        return []
    results = col.query(
        query_texts=[query],
        n_results=min(n_results, col.count()),
        include=["documents", "metadatas", "distances"],
    )
    return _format_results(results)


def get_all_preferences() -> list[dict]:
    """모든 선호 항목을 반환한다."""
    col = _get_collection(COL_PREFERENCE)
    if col.count() == 0:
        return []
    items = col.get(include=["documents", "metadatas"])
    results = []
    for i, doc_id in enumerate(items.get("ids", [])):
        results.append({
            "id": doc_id,
            "text": items["documents"][i] if items.get("documents") else "",
            "metadata": items["metadatas"][i] if items.get("metadatas") else {},
        })
    return results


def update_preference_count(doc_id: str, increment: int = 1) -> int:
    """선호 항목의 누적 카운트를 증가시키고 현재 카운트를 반환한다."""
    col = _get_collection(COL_PREFERENCE)
    existing = col.get(ids=[doc_id], include=["metadatas"])
    if not existing["ids"]:
        return 0
    meta = existing["metadatas"][0]
    new_count = int(meta.get("count", 1)) + increment
    meta["count"] = new_count
    meta["last_updated"] = _now_iso()
    col.update(ids=[doc_id], metadatas=[meta])
    return new_count


# ---------------------------------------------------------------------------
# Dataset 후보
# ---------------------------------------------------------------------------

def add_dataset_candidate(
    text: str,
    metadata: Optional[dict] = None,
    doc_id: Optional[str] = None,
) -> str:
    """파인튜닝 후보 데이터를 기록한다."""
    col = _get_collection(COL_DATASET)
    doc_id = doc_id or str(uuid.uuid4())
    meta = metadata or {}
    meta.setdefault("created_at", _now_iso())
    col.add(ids=[doc_id], documents=[text], metadatas=[meta])
    return doc_id


# ---------------------------------------------------------------------------
# 공통 유틸
# ---------------------------------------------------------------------------

def _format_results(results: dict) -> list[dict]:
    """ChromaDB query 결과를 통일된 형식으로 변환한다."""
    formatted = []
    ids = results.get("ids", [[]])[0]
    docs = (results.get("documents") or [[]])[0]
    metas = (results.get("metadatas") or [[]])[0]
    distances = (results.get("distances") or [[]])[0]

    for i, doc_id in enumerate(ids):
        formatted.append({
            "id": doc_id,
            "text": docs[i] if i < len(docs) else "",
            "metadata": metas[i] if i < len(metas) else {},
            "distance": distances[i] if i < len(distances) else 1.0,
        })
    return formatted


def reset_collections_for_test() -> None:
    """테스트 전용: 전역 상태 초기화."""
    global _client, _collections
    _client = None
    _collections = {}
