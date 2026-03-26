"""
능동 알림 주기 제어 테스트.
- can_trigger: DAILY_ONCE / 간격 / DAILY_MAX / 무시 억제
- log_trigger / mark_ignored
- POST /proactive/check, POST /proactive/ignored, GET /proactive/status
"""

import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
import aiosqlite
from httpx import AsyncClient, ASGITransport


# ── 공통 픽스처 ──────────────────────────────────────────────


@pytest.fixture(autouse=True)
def use_tmp_db(tmp_path, monkeypatch):
    """각 테스트마다 임시 SQLite DB를 사용한다."""
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setenv("DB_PATH", db_file)
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.chat_pipeline as cp_mod
    monkeypatch.setattr(cp_mod, "DB_PATH", db_file)
    import backend.routers.memory as mem_mod
    monkeypatch.setattr(mem_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc_mod
    monkeypatch.setattr(svc_mod, "DB_PATH", db_file)
    import backend.routers.proactive as router_mod
    monkeypatch.setattr(router_mod, "DB_PATH", db_file)


@pytest.fixture(autouse=True)
def mock_memory_service(monkeypatch):
    """memory 서비스 no-op mock."""
    import backend.services.memory as svc_mod
    from unittest.mock import AsyncMock
    monkeypatch.setattr(svc_mod, "search_memory", AsyncMock(return_value=[]))
    monkeypatch.setattr(svc_mod, "update_confidence", AsyncMock())


@pytest.fixture(autouse=True)
def reset_mood(monkeypatch):
    """무드 상태 초기화."""
    import backend.services.mood as mood_mod
    mood_mod._current_mood = "IDLE"
    mood_mod._subscribers.clear()
    yield
    mood_mod._subscribers.clear()


@pytest_asyncio.fixture
async def client(use_tmp_db):
    from backend.main import app
    from backend.models.schema import init_db
    await init_db()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# 테스트에서 직접 DB에 레코드를 삽입할 때 사용하는 헬퍼
async def _insert_log(db_path: str, event_type: str, session_date: str,
                      triggered_at: str | None = None, was_ignored: bool = False) -> str:
    log_id = str(uuid.uuid4())
    ts = triggered_at or datetime.now().isoformat()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO proactive_log (id, event_type, triggered_at, was_ignored, session_date) "
            "VALUES (?, ?, ?, ?, ?)",
            (log_id, event_type, ts, int(was_ignored), session_date),
        )
        await db.commit()
    return log_id


# ── can_trigger: DAILY_ONCE ──────────────────────────────────


@pytest.mark.asyncio
async def test_can_trigger_daily_once_first_call(tmp_path, monkeypatch):
    """night_snack 오늘 첫 호출 → True."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    result = await svc.can_trigger("night_snack")
    assert result is True


@pytest.mark.asyncio
async def test_can_trigger_daily_once_second_call(tmp_path, monkeypatch):
    """night_snack 오늘 두 번째 호출 → False."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    today = datetime.now().strftime("%Y-%m-%d")
    await _insert_log(db_file, "night_snack", today)

    result = await svc.can_trigger("night_snack")
    assert result is False


# ── can_trigger: INTERVAL_RULES ─────────────────────────────


@pytest.mark.asyncio
async def test_can_trigger_interval_first_call(tmp_path, monkeypatch):
    """autonomous_talk 첫 호출 (기록 없음) → True."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    result = await svc.can_trigger("autonomous_talk")
    assert result is True


@pytest.mark.asyncio
async def test_can_trigger_interval_too_soon(tmp_path, monkeypatch):
    """autonomous_talk 30분 전 기록 → False (60분 간격 미달)."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    today = datetime.now().strftime("%Y-%m-%d")
    thirty_min_ago = (datetime.now() - timedelta(minutes=30)).isoformat()
    await _insert_log(db_file, "autonomous_talk", today, triggered_at=thirty_min_ago)

    result = await svc.can_trigger("autonomous_talk")
    assert result is False


@pytest.mark.asyncio
async def test_can_trigger_interval_passed(tmp_path, monkeypatch):
    """autonomous_talk 61분 전 기록 → True (60분 간격 통과)."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    today = datetime.now().strftime("%Y-%m-%d")
    sixty_one_min_ago = (datetime.now() - timedelta(minutes=61)).isoformat()
    await _insert_log(db_file, "autonomous_talk", today, triggered_at=sixty_one_min_ago)

    result = await svc.can_trigger("autonomous_talk")
    assert result is True


@pytest.mark.asyncio
async def test_can_trigger_session_once(tmp_path, monkeypatch):
    """work_time_1h 오늘 이미 실행 → False (세션당 1회)."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    today = datetime.now().strftime("%Y-%m-%d")
    await _insert_log(db_file, "work_time_1h", today)

    result = await svc.can_trigger("work_time_1h")
    assert result is False


# ── can_trigger: DAILY_MAX ───────────────────────────────────


@pytest.mark.asyncio
async def test_daily_max_not_exceeded(tmp_path, monkeypatch):
    """autonomous_talk 9회 기록 → True (10회 한도 미초과)."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    today = datetime.now().strftime("%Y-%m-%d")
    # 9개 삽입 — 각각 1시간 이상 간격으로 설정
    for i in range(9):
        ts = (datetime.now() - timedelta(hours=9 - i)).isoformat()
        await _insert_log(db_file, "autonomous_talk", today, triggered_at=ts)

    result = await svc.can_trigger("autonomous_talk")
    assert result is True


@pytest.mark.asyncio
async def test_daily_max_exceeded(tmp_path, monkeypatch):
    """autonomous_talk 10회 기록 → False (10회 한도 초과)."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    today = datetime.now().strftime("%Y-%m-%d")
    for i in range(10):
        ts = (datetime.now() - timedelta(hours=10 - i)).isoformat()
        await _insert_log(db_file, "autonomous_talk", today, triggered_at=ts)

    result = await svc.can_trigger("autonomous_talk")
    assert result is False


# ── can_trigger: 무시 억제 ──────────────────────────────────


@pytest.mark.asyncio
async def test_ignore_suppression_below_threshold(tmp_path, monkeypatch):
    """무시 2회 → autonomous_talk 아직 허용."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    today = datetime.now().strftime("%Y-%m-%d")
    for i in range(2):
        ts = (datetime.now() - timedelta(hours=3 - i)).isoformat()
        await _insert_log(db_file, "autonomous_talk", today, triggered_at=ts,
                          was_ignored=True)

    result = await svc.can_trigger("autonomous_talk")
    assert result is True


@pytest.mark.asyncio
async def test_ignore_suppression_at_threshold(tmp_path, monkeypatch):
    """무시 3회 → autonomous_talk 당일 중단."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    today = datetime.now().strftime("%Y-%m-%d")
    for i in range(3):
        ts = (datetime.now() - timedelta(hours=4 - i)).isoformat()
        await _insert_log(db_file, "autonomous_talk", today, triggered_at=ts,
                          was_ignored=True)

    result = await svc.can_trigger("autonomous_talk")
    assert result is False


# ── log_trigger / mark_ignored ──────────────────────────────


@pytest.mark.asyncio
async def test_log_trigger_returns_uuid(tmp_path, monkeypatch):
    """log_trigger가 UUID를 반환하고 DB에 기록된다."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    log_id = await svc.log_trigger("mood_check")
    assert log_id  # UUID 형식 비어있지 않음

    async with aiosqlite.connect(db_file) as db:
        async with db.execute(
            "SELECT event_type, was_ignored FROM proactive_log WHERE id = ?", (log_id,)
        ) as cur:
            row = await cur.fetchone()
    assert row is not None
    assert row[0] == "mood_check"
    assert row[1] == 0  # was_ignored = False


@pytest.mark.asyncio
async def test_mark_ignored(tmp_path, monkeypatch):
    """mark_ignored 호출 후 was_ignored = True."""
    from backend.models.schema import init_db
    import backend.models.schema as schema_mod
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc
    monkeypatch.setattr(svc, "DB_PATH", db_file)
    await init_db()

    log_id = await svc.log_trigger("autonomous_talk")
    await svc.mark_ignored(log_id)

    async with aiosqlite.connect(db_file) as db:
        async with db.execute(
            "SELECT was_ignored FROM proactive_log WHERE id = ?", (log_id,)
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == 1


# ── 엔드포인트 테스트 ────────────────────────────────────────


@pytest.mark.asyncio
async def test_proactive_check_endpoint_first(client):
    """POST /proactive/check — mood_check 첫 호출 → can_trigger: true."""
    resp = await client.post("/proactive/check", json={"event_type": "mood_check"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["can_trigger"] is True
    assert "log_id" in data


@pytest.mark.asyncio
async def test_proactive_check_endpoint_duplicate(client):
    """POST /proactive/check — mood_check 두 번째 → can_trigger: false."""
    await client.post("/proactive/check", json={"event_type": "mood_check"})
    resp = await client.post("/proactive/check", json={"event_type": "mood_check"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["can_trigger"] is False
    assert data["reason"] == "already_triggered_today"


@pytest.mark.asyncio
async def test_proactive_ignored_endpoint(client):
    """POST /proactive/ignored — log_id 전달 → success: true."""
    check = await client.post("/proactive/check", json={"event_type": "autonomous_talk"})
    log_id = check.json()["log_id"]

    resp = await client.post("/proactive/ignored", json={"log_id": log_id})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_proactive_status_endpoint_empty(client):
    """GET /proactive/status — 기록 없을 때 기본값 반환."""
    resp = await client.get("/proactive/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mood_check_done_today"] is False
    assert data["autonomous_talk_count_today"] == 0
    assert data["autonomous_talk_remaining_today"] == 10
    assert data["last_autonomous_talk_minutes_ago"] is None


@pytest.mark.asyncio
async def test_proactive_status_endpoint_with_data(client):
    """GET /proactive/status — autonomous_talk 3회 후 현황 반영."""
    for _ in range(3):
        await client.post("/proactive/check", json={"event_type": "night_snack"})

    # autonomous_talk 3회 직접 삽입 (간격 우회)
    import backend.services.proactive_service as svc
    for i in range(3):
        await svc.log_trigger("autonomous_talk")

    resp = await client.get("/proactive/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["autonomous_talk_count_today"] == 3
    assert data["autonomous_talk_remaining_today"] == 7
    assert data["last_autonomous_talk_minutes_ago"] is not None
