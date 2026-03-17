"""
Phase 2 장기기억 테스트.
mem0와 Ollama는 모두 mock으로 대체한다 — 실제 LLM 호출 없음.
"""

import json
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# 공통 픽스처
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def use_tmp_db(tmp_path, monkeypatch):
    """각 테스트마다 임시 SQLite DB를 사용한다."""
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setenv("DB_PATH", db_file)
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.routers.chat as chat_mod
    monkeypatch.setattr(chat_mod, "DB_PATH", db_file)
    import backend.routers.memory as mem_mod
    monkeypatch.setattr(mem_mod, "DB_PATH", db_file)
    import backend.services.memory as svc_mod
    monkeypatch.setattr(svc_mod, "DB_PATH", db_file)
    import backend.tasks.decay_tasks as decay_mod
    # decay task imports DB_PATH at runtime — env var is enough


@pytest.fixture(autouse=True)
def mock_mem0(monkeypatch):
    """모든 테스트에서 mem0 _get_mem0를 mock으로 대체한다."""
    import backend.services.memory as svc_mod

    mock_instance = MagicMock()
    mock_instance.add.return_value = {"results": []}
    mock_instance.search.return_value = []
    monkeypatch.setattr(svc_mod, "_get_mem0", lambda: mock_instance)
    return mock_instance


@pytest_asyncio.fixture
async def client(use_tmp_db, mock_mem0):
    from backend.main import app
    from backend.models.schema import init_db
    # ASGITransport은 lifespan을 트리거하지 않으므로 직접 DB 초기화
    await init_db()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


def parse_sse(text: str) -> list[dict]:
    events = []
    for line in text.splitlines():
        if line.startswith("data: ") and line != "data: [DONE]":
            events.append(json.loads(line[6:]))
    return events


# ---------------------------------------------------------------------------
# test_schema_migration: 새 컬럼과 테이블이 존재하는지 확인
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_schema_migration(use_tmp_db):
    """init_db 후 messages에 Phase 2 신규 컬럼과 voice_logs 테이블이 존재한다."""
    import aiosqlite
    from backend.models.schema import DB_PATH, init_db

    await init_db()

    async with aiosqlite.connect(DB_PATH) as db:
        # messages 컬럼 확인
        async with db.execute("PRAGMA table_info(messages)") as cursor:
            cols = {row[1] for row in await cursor.fetchall()}

        assert "input_mode" in cols
        assert "is_proactive" in cols
        assert "screen_context" in cols
        assert "owner_response_delay_ms" in cols

        # voice_logs 테이블 확인
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='voice_logs'"
        ) as cursor:
            assert await cursor.fetchone() is not None


# ---------------------------------------------------------------------------
# test_schema_migration_existing_db: 기존 DB에 마이그레이션이 적용된다
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_schema_migration_existing_db(use_tmp_db):
    """이미 생성된 DB에 init_db를 다시 호출해도 오류 없이 마이그레이션된다."""
    from backend.models.schema import init_db

    await init_db()
    # 두 번 호출 — idempotent 확인
    await init_db()


# ---------------------------------------------------------------------------
# test_memory_search_returns_results: 기억 저장 후 검색
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_memory_search_returns_results(use_tmp_db, mock_mem0):
    """add_memory로 저장한 사실을 search_memory로 조회할 수 있다."""
    import backend.services.memory as svc_mod
    from backend.models.schema import init_db

    await init_db()

    # mem0가 "Python 개발자" 사실을 추출했다고 가정
    mock_mem0.add.return_value = {
        "results": [{"memory": "오너는 Python 개발자야", "event": "ADD"}]
    }

    facts = await svc_mod.add_memory("owner", "나 Python으로 개발해")
    assert len(facts) == 1
    assert "Python" in facts[0]

    results = await svc_mod.search_memory("owner", "Python")
    assert len(results) == 1
    assert "Python" in results[0]["fact"]
    assert results[0]["confidence"] == 1.0


# ---------------------------------------------------------------------------
# test_memory_confidence_decay: decay 실행 후 confidence 감소 확인
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_memory_confidence_decay(use_tmp_db):
    """오래된 기억의 confidence가 decay 후 감소한다."""
    import aiosqlite
    from backend.models.schema import DB_PATH, init_db
    from backend.tasks.decay_tasks import _run_decay

    await init_db()

    # 8일 전 last_referenced인 기억을 직접 삽입
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO memory_facts (id, fact, confidence, last_referenced, created_at)
            VALUES ('f1', '테스트 기억', 0.9, datetime('now', '-8 days'), datetime('now'))
            """
        )
        await db.commit()

    await _run_decay()

    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT confidence FROM memory_facts WHERE id = 'f1'"
        ) as cursor:
            row = await cursor.fetchone()

    # 0.9 * 0.97 ≈ 0.873
    assert row[0] < 0.9
    assert row[0] > 0.1  # 최솟값 이상


# ---------------------------------------------------------------------------
# test_memory_confidence_no_decay_recent: 최근 기억은 decay되지 않는다
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_memory_confidence_no_decay_recent(use_tmp_db):
    """최근에 참조된 기억은 decay 대상에서 제외된다."""
    import aiosqlite
    from backend.models.schema import DB_PATH, init_db
    from backend.tasks.decay_tasks import _run_decay

    await init_db()

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO memory_facts (id, fact, confidence, last_referenced, created_at)
            VALUES ('f2', '최신 기억', 0.9, datetime('now'), datetime('now'))
            """
        )
        await db.commit()

    await _run_decay()

    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT confidence FROM memory_facts WHERE id = 'f2'"
        ) as cursor:
            row = await cursor.fetchone()

    assert row[0] == 0.9  # 변화 없음


# ---------------------------------------------------------------------------
# test_chat_injects_memory: /chat 요청 시 기억이 stream_chat에 전달된다
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_injects_memory(client, mock_mem0):
    """/chat 요청 시 검색된 기억이 stream_chat의 memory_context에 주입된다."""
    import backend.routers.chat as chat_mod
    import backend.services.memory as svc_mod

    injected_context = None

    async def fake_stream(messages, memory_context=None):
        nonlocal injected_context
        injected_context = memory_context
        yield "응답"

    # search_memory가 사실을 반환하도록 설정
    with patch("backend.routers.chat.search_memory", new_callable=AsyncMock) as mock_search, \
         patch("backend.routers.chat.update_confidence", new_callable=AsyncMock), \
         patch("backend.routers.chat.stream_chat", side_effect=fake_stream):
        mock_search.return_value = [
            {"id": "f1", "fact": "오너는 Python 개발자야", "confidence": 0.9}
        ]

        resp = await client.post("/chat", json={"message": "안녕"})

    assert resp.status_code == 200
    assert injected_context is not None
    assert "Python 개발자야" in injected_context


# ---------------------------------------------------------------------------
# test_chat_no_memory_context_when_empty: 기억 없으면 context는 None
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_no_memory_context_when_empty(client):
    """/chat 요청 시 기억이 없으면 memory_context가 None으로 전달된다."""
    import backend.services.memory as svc_mod

    injected_context = "NOT_SET"

    async def fake_stream(messages, memory_context=None):
        nonlocal injected_context
        injected_context = memory_context
        yield "응답"

    with patch("backend.routers.chat.search_memory", new_callable=AsyncMock) as mock_search, \
         patch("backend.routers.chat.update_confidence", new_callable=AsyncMock), \
         patch("backend.routers.chat.stream_chat", side_effect=fake_stream):
        mock_search.return_value = []

        await client.post("/chat", json={"message": "안녕"})

    assert injected_context is None


# ---------------------------------------------------------------------------
# test_owner_response_delay_saved: delay_ms가 DB에 저장된다
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_owner_response_delay_saved(use_tmp_db):
    """두 번째 /chat 요청 시 owner_response_delay_ms가 user 메시지에 저장된다."""
    import aiosqlite
    from backend.models.schema import DB_PATH
    import backend.services.memory as svc_mod

    async def fake_stream(messages, memory_context=None):
        yield "응답"

    with patch("backend.routers.chat.search_memory", new_callable=AsyncMock) as mock_search, \
         patch("backend.routers.chat.update_confidence", new_callable=AsyncMock), \
         patch("backend.routers.chat.stream_chat", side_effect=fake_stream):
        mock_search.return_value = []

        from backend.main import app
        from backend.models.schema import init_db
        await init_db()
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            conv_id = "delay-test-conv"
            await ac.post("/chat", json={"message": "첫 번째", "conversation_id": conv_id})
            await ac.post("/chat", json={"message": "두 번째", "conversation_id": conv_id})

    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """
            SELECT owner_response_delay_ms FROM messages
            WHERE conversation_id = ? AND role = 'user'
            ORDER BY created_at ASC
            """,
            (conv_id,),
        ) as cursor:
            rows = await cursor.fetchall()

    # 첫 메시지는 delay 없음, 두 번째 메시지는 delay 있음
    assert rows[0][0] is None
    assert rows[1][0] is not None
    assert rows[1][0] >= 0


# ---------------------------------------------------------------------------
# test_memory_facts_endpoint: GET /memory/facts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_memory_facts_endpoint(client, use_tmp_db):
    """GET /memory/facts는 저장된 사실을 반환한다."""
    import aiosqlite
    from backend.models.schema import DB_PATH

    # 사실 직접 삽입
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO memory_facts (id, fact, confidence, created_at) VALUES (?, ?, ?, datetime('now'))",
            ("mf1", "오너는 Python을 좋아해", 0.9),
        )
        await db.commit()

    resp = await client.get("/memory/facts?query=Python&limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["facts"]) == 1
    assert data["facts"][0]["fact"] == "오너는 Python을 좋아해"


# ---------------------------------------------------------------------------
# test_delete_memory_fact: DELETE /memory/facts/{id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_memory_fact(client, use_tmp_db):
    """DELETE /memory/facts/{id}는 해당 사실을 삭제한다."""
    import aiosqlite
    from backend.models.schema import DB_PATH

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO memory_facts (id, fact, confidence, created_at) VALUES (?, ?, ?, datetime('now'))",
            ("del-fact-1", "삭제할 기억", 0.8),
        )
        await db.commit()

    resp = await client.delete("/memory/facts/del-fact-1")
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id FROM memory_facts WHERE id = 'del-fact-1'"
        ) as cursor:
            assert await cursor.fetchone() is None


# ---------------------------------------------------------------------------
# test_delete_memory_fact_not_found: 없는 사실 삭제 → 404
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_memory_fact_not_found(client):
    """없는 fact_id로 DELETE 요청 시 404를 반환한다."""
    resp = await client.delete("/memory/facts/nonexistent-id")
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "FACT_NOT_FOUND"
