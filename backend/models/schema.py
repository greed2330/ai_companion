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
    owner_emotion           TEXT,
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
    mem0_id             TEXT,
    fact                TEXT NOT NULL,
    embedding           BLOB,
    source_message_id   TEXT REFERENCES messages(id),
    confidence          REAL DEFAULT 1.0,
    reference_count     INTEGER DEFAULT 0,
    last_referenced     TIMESTAMP,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

CREATE_MEMORY_FACTS_MEM0_IDX = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_facts_mem0_id
ON memory_facts(mem0_id) WHERE mem0_id IS NOT NULL;
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

# Phase 4 능동 알림 주기 제어 로그
CREATE_PROACTIVE_LOG = """
CREATE TABLE IF NOT EXISTS proactive_log (
    id              TEXT PRIMARY KEY,   -- UUID
    event_type      TEXT NOT NULL,      -- 이벤트 타입 (afk_sleepy, night_snack 등)
    triggered_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    was_ignored     BOOLEAN DEFAULT 0,  -- 오너가 무시했는지 여부
    session_date    TEXT NOT NULL       -- YYYY-MM-DD (하루 1회 체크용)
);
"""

# SPEC-06: 하나 상태 싱글턴 (Tier 1 무드 + relationship_warmth 영속화)
CREATE_HANA_STATE = """
CREATE TABLE IF NOT EXISTS hana_state (
    id                    TEXT PRIMARY KEY DEFAULT 'singleton',
    tier1_mood            TEXT NOT NULL DEFAULT 'IDLE',
    tier1_intensity       REAL NOT NULL DEFAULT 0.5,
    tier1_updated_at      TIMESTAMP,
    relationship_warmth   REAL NOT NULL DEFAULT 0.0,
    warmth_updated_at     TIMESTAMP,
    first_conversation_at TIMESTAMP,
    total_session_count   INTEGER NOT NULL DEFAULT 0
);
"""

CREATE_HANA_STATE_SEED = "INSERT OR IGNORE INTO hana_state (id) VALUES ('singleton');"

ALL_TABLES = [
    CREATE_CONVERSATIONS,
    CREATE_MESSAGES,
    CREATE_FEEDBACK,
    CREATE_MEMORY_FACTS,
    # CREATE_MEMORY_FACTS_MEM0_IDX는 _migrate()에서 컬럼 추가 후 생성
    CREATE_MCP_HISTORY,
    CREATE_MINECRAFT_ACTIONS,
    CREATE_VOICE_LOGS,
    CREATE_PROACTIVE_LOG,
    CREATE_HANA_STATE,
    CREATE_HANA_STATE_SEED,
]

# Phase 2 신규 컬럼 — 기존 DB 마이그레이션용
_MESSAGES_NEW_COLUMNS = [
    ("input_mode", "TEXT DEFAULT 'text'"),
    ("is_proactive", "INTEGER DEFAULT 0"),
    ("screen_context", "TEXT"),
    ("owner_response_delay_ms", "INTEGER"),
    ("owner_emotion", "TEXT"),
]

# SPEC-02: memory_facts.mem0_id 마이그레이션
_MEMORY_FACTS_NEW_COLUMNS = [
    ("mem0_id", "TEXT"),
]

# SPEC-06 마이그레이션
_MEMORY_FACTS_SPEC06_COLUMNS = [
    ("memory_type",      "TEXT DEFAULT 'semantic'"),
    ("emotional_weight", "REAL DEFAULT 0.5"),
]

_FEEDBACK_SPEC06_COLUMNS = [
    ("finetune_tags", "TEXT"),
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
            pass

    for col, typedef in _MEMORY_FACTS_NEW_COLUMNS:
        try:
            await db.execute(f"ALTER TABLE memory_facts ADD COLUMN {col} {typedef}")
            await db.commit()
        except aiosqlite.OperationalError:
            pass

    for col, typedef in _MEMORY_FACTS_SPEC06_COLUMNS:
        try:
            await db.execute(f"ALTER TABLE memory_facts ADD COLUMN {col} {typedef}")
            await db.commit()
        except aiosqlite.OperationalError:
            pass

    for col, typedef in _FEEDBACK_SPEC06_COLUMNS:
        try:
            await db.execute(f"ALTER TABLE feedback ADD COLUMN {col} {typedef}")
            await db.commit()
        except aiosqlite.OperationalError:
            pass

    # mem0_id UNIQUE INDEX — 이미 있으면 무시
    try:
        await db.execute(CREATE_MEMORY_FACTS_MEM0_IDX)
        await db.commit()
    except aiosqlite.OperationalError:
        pass


async def get_db() -> aiosqlite.Connection:
    """라우터에서 사용할 DB 커넥션 팩토리."""
    return await aiosqlite.connect(DB_PATH)
