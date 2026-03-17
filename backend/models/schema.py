"""
DB 스키마 정의 및 초기화.
AGENTS.md 6번 스키마 전체 구현.
"""

import aiosqlite
import os

DB_PATH = os.getenv("DB_PATH", "data/hana.db")


CREATE_CONVERSATIONS = """
CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    started_at      TIMESTAMP NOT NULL,
    ended_at        TIMESTAMP,
    session_summary TEXT
);
"""

# Phase 2 신규 컬럼 포함
CREATE_MESSAGES = """
CREATE TABLE IF NOT EXISTS messages (
    id                      TEXT PRIMARY KEY,
    conversation_id         TEXT NOT NULL REFERENCES conversations(id),
    role                    TEXT NOT NULL,
    content                 TEXT NOT NULL,
    interaction_type        TEXT,
    mood_at_response        TEXT,
    response_time_ms        INTEGER,
    input_mode              TEXT DEFAULT 'text',
    is_proactive            INTEGER DEFAULT 0,
    screen_context          TEXT,
    owner_response_delay_ms INTEGER,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

CREATE_FEEDBACK = """
CREATE TABLE IF NOT EXISTS feedback (
    message_id      TEXT PRIMARY KEY REFERENCES messages(id),
    explicit_score  INTEGER,
    implicit_signal TEXT,
    auto_score      REAL,
    final_score     REAL
);
"""

CREATE_MEMORY_FACTS = """
CREATE TABLE IF NOT EXISTS memory_facts (
    id                  TEXT PRIMARY KEY,
    fact                TEXT NOT NULL,
    embedding           BLOB,
    source_message_id   TEXT REFERENCES messages(id),
    confidence          REAL DEFAULT 1.0,
    reference_count     INTEGER DEFAULT 0,
    last_referenced     TIMESTAMP,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

CREATE_MCP_HISTORY = """
CREATE TABLE IF NOT EXISTS mcp_history (
    id              TEXT PRIMARY KEY,
    tool            TEXT NOT NULL,
    command         TEXT NOT NULL,
    result          TEXT,
    approved        BOOLEAN DEFAULT 1,
    executed_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

CREATE_MINECRAFT_ACTIONS = """
CREATE TABLE IF NOT EXISTS minecraft_actions (
    id              TEXT PRIMARY KEY,
    action_type     TEXT NOT NULL,
    context         TEXT,
    action          TEXT NOT NULL,
    result          TEXT,
    reward_signal   REAL,
    executed_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

# Phase 4.5 음성 입출력 로그 (스키마 미리 생성)
CREATE_VOICE_LOGS = """
CREATE TABLE IF NOT EXISTS voice_logs (
    id          TEXT PRIMARY KEY,
    message_id  TEXT REFERENCES messages(id),
    direction   TEXT NOT NULL,
    input       TEXT,
    output      TEXT,
    confidence  REAL,
    duration_ms INTEGER,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

ALL_TABLES = [
    CREATE_CONVERSATIONS,
    CREATE_MESSAGES,
    CREATE_FEEDBACK,
    CREATE_MEMORY_FACTS,
    CREATE_MCP_HISTORY,
    CREATE_MINECRAFT_ACTIONS,
    CREATE_VOICE_LOGS,
]

# Phase 2 신규 컬럼 — 기존 DB 마이그레이션용
_MESSAGES_NEW_COLUMNS = [
    ("input_mode", "TEXT DEFAULT 'text'"),
    ("is_proactive", "INTEGER DEFAULT 0"),
    ("screen_context", "TEXT"),
    ("owner_response_delay_ms", "INTEGER"),
]


async def init_db() -> None:
    """앱 시작 시 DB 파일과 모든 테이블을 생성하고 마이그레이션을 실행한다."""
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        for stmt in ALL_TABLES:
            await db.execute(stmt)
        await db.commit()
        await _migrate(db)


async def _migrate(db: aiosqlite.Connection) -> None:
    """기존 DB에 신규 컬럼을 추가한다. 이미 있으면 무시한다."""
    for col, typedef in _MESSAGES_NEW_COLUMNS:
        try:
            await db.execute(f"ALTER TABLE messages ADD COLUMN {col} {typedef}")
            await db.commit()
        except aiosqlite.OperationalError:
            # 컬럼이 이미 존재함
            pass


async def get_db() -> aiosqlite.Connection:
    """라우터에서 사용할 DB 커넥션 팩토리."""
    return await aiosqlite.connect(DB_PATH)
