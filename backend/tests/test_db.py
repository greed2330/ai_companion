"""
DB 스키마 초기화 테스트.
앱 시작 시 모든 테이블이 생성되는지 확인한다.
"""

import pytest
import aiosqlite


EXPECTED_TABLES = {
    "conversations",
    "messages",
    "feedback",
    "memory_facts",
    "mcp_history",
    "minecraft_actions",
}


@pytest.fixture
def tmp_db_path(tmp_path):
    return str(tmp_path / "test_schema.db")


@pytest.mark.asyncio
async def test_all_tables_created(tmp_db_path, monkeypatch):
    """init_db() 호출 후 모든 테이블이 존재해야 한다."""
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", tmp_db_path)

    await schema_mod.init_db()

    async with aiosqlite.connect(tmp_db_path) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ) as cursor:
            rows = await cursor.fetchall()

    created = {r[0] for r in rows}
    assert EXPECTED_TABLES.issubset(created), (
        f"누락된 테이블: {EXPECTED_TABLES - created}"
    )


@pytest.mark.asyncio
async def test_init_db_idempotent(tmp_db_path, monkeypatch):
    """init_db()를 두 번 호출해도 오류 없이 동작해야 한다 (IF NOT EXISTS)."""
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", tmp_db_path)

    await schema_mod.init_db()
    await schema_mod.init_db()  # 두 번째 호출도 안전해야 함


@pytest.mark.asyncio
async def test_conversations_schema(tmp_db_path, monkeypatch):
    """conversations 테이블 컬럼 구조를 검증한다."""
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", tmp_db_path)
    await schema_mod.init_db()

    async with aiosqlite.connect(tmp_db_path) as db:
        async with db.execute("PRAGMA table_info(conversations)") as cursor:
            cols = {row[1] for row in await cursor.fetchall()}

    assert {"id", "started_at", "ended_at", "session_summary"}.issubset(cols)


@pytest.mark.asyncio
async def test_messages_schema(tmp_db_path, monkeypatch):
    """messages 테이블 컬럼 구조를 검증한다."""
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", tmp_db_path)
    await schema_mod.init_db()

    async with aiosqlite.connect(tmp_db_path) as db:
        async with db.execute("PRAGMA table_info(messages)") as cursor:
            cols = {row[1] for row in await cursor.fetchall()}

    expected = {
        "id", "conversation_id", "role", "content",
        "interaction_type", "mood_at_response", "response_time_ms", "created_at",
    }
    assert expected.issubset(cols)
