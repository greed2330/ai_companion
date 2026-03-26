"""
무드 스트림, 무드 엔진, 설정 모델 스캔 테스트.
SSE 스트림 엔드포인트는 제너레이터 함수를 직접 테스트한다.
(httpx ASGI transport는 무한 SSE 스트림 연결을 종료하지 못해 hang이 발생함)
"""

import asyncio
import json
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch


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


@pytest.fixture(autouse=True)
def mock_memory_service(monkeypatch):
    """search_memory와 update_confidence를 no-op mock으로 대체한다."""
    import backend.services.memory as svc_mod
    monkeypatch.setattr(svc_mod, "search_memory", AsyncMock(return_value=[]))
    monkeypatch.setattr(svc_mod, "update_confidence", AsyncMock())


@pytest.fixture(autouse=True)
def reset_mood():
    """각 테스트 전후 무드 상태와 구독자 목록을 초기화한다."""
    import backend.services.mood as mood_mod
    mood_mod._current_mood = "IDLE"
    mood_mod._subscribers.clear()
    yield
    mood_mod._subscribers.clear()


@pytest.fixture(autouse=True)
def reset_character_model(monkeypatch):
    import backend.routers.settings as settings_mod
    monkeypatch.setattr(settings_mod, "_current_character_model_id", None)


@pytest_asyncio.fixture
async def client(use_tmp_db, mock_memory_service, reset_mood):
    from backend.main import app
    from backend.models.schema import init_db
    await init_db()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


# ── 무드 서비스 단위 테스트 ──────────────────────────────────


def test_detect_mood_from_text_happy():
    from backend.services.mood import detect_mood_from_text
    assert detect_mood_from_text("ㅋㅋ 문제 해결했어!") == "HAPPY"


def test_detect_mood_from_text_concerned():
    from backend.services.mood import detect_mood_from_text
    assert detect_mood_from_text("에러가 발생했어") == "CONCERNED"


def test_detect_mood_from_text_focused():
    from backend.services.mood import detect_mood_from_text
    assert detect_mood_from_text("코딩 계속할게") == "FOCUSED"


def test_detect_mood_from_text_idle_fallback():
    from backend.services.mood import detect_mood_from_text
    assert detect_mood_from_text("안녕") == "IDLE"


def test_set_mood_pushes_to_subscriber():
    """set_mood 호출 시 구독 큐에 이벤트가 쌓여야 한다."""
    import backend.services.mood as mood_mod

    q = mood_mod.subscribe()
    mood_mod.set_mood("HAPPY")

    assert not q.empty()
    event = q.get_nowait()
    assert event["type"] == "mood_change"
    assert event["mood"] == "HAPPY"

    mood_mod.unsubscribe(q)


def test_unsubscribe_removes_queue():
    import backend.services.mood as mood_mod

    q = mood_mod.subscribe()
    assert q in mood_mod._subscribers
    mood_mod.unsubscribe(q)
    assert q not in mood_mod._subscribers


# ── /mood/stream SSE 제너레이터 단위 테스트 ──────────────────
# httpx ASGI transport로 무한 SSE를 테스트하면 hang이 발생하므로
# 제너레이터 함수를 직접 호출해 동작을 검증한다.


@pytest.mark.asyncio
async def test_mood_stream_initial_event():
    """/mood/stream 연결 즉시 현재 무드 이벤트를 반환해야 한다."""
    import backend.services.mood as mood_mod
    from backend.routers.mood import mood_stream

    mood_mod._current_mood = "IDLE"

    resp = await mood_stream()
    # StreamingResponse의 body_iterator에서 제너레이터를 꺼낸다
    gen = resp.body_iterator

    first_chunk = await gen.__anext__()
    assert first_chunk.startswith("data:")
    event = json.loads(first_chunk[len("data:"):].strip())
    assert event["type"] == "mood_change"
    assert event["mood"] == "IDLE"

    # 정리: 제너레이터 종료
    await gen.aclose()


@pytest.mark.asyncio
async def test_mood_stream_receives_change():
    """구독 중에 set_mood가 호출되면 큐에 이벤트가 들어와야 한다."""
    import backend.services.mood as mood_mod

    q = mood_mod.subscribe()
    mood_mod.set_mood("GAMING")

    event = q.get_nowait()
    assert event["mood"] == "GAMING"
    assert event["type"] == "mood_change"

    mood_mod.unsubscribe(q)


@pytest.mark.asyncio
async def test_heartbeat_sent_on_timeout(monkeypatch):
    """큐에 이벤트가 없을 때 heartbeat comment가 yield되어야 한다."""
    import backend.services.mood as mood_mod
    import backend.routers.mood as mood_router_mod

    # heartbeat 간격을 0으로 줄여 즉시 timeout 발생
    monkeypatch.setattr(mood_router_mod, "_HEARTBEAT_INTERVAL", 0)
    mood_mod._current_mood = "IDLE"

    resp = await mood_router_mod.mood_stream()
    gen = resp.body_iterator

    # 첫 번째 chunk = 초기 무드 이벤트
    await gen.__anext__()
    # 두 번째 chunk = heartbeat (interval=0 이므로 바로 timeout)
    second_chunk = await gen.__anext__()
    assert second_chunk == ": heartbeat\n\n"

    await gen.aclose()


# ── /chat 무드 트리거 테스트 ─────────────────────────────────


@pytest.mark.asyncio
async def test_mood_trigger_from_message(client):
    """POST /chat 응답에 에러 키워드가 있으면 CONCERNED 무드로 바뀌어야 한다."""
    import backend.services.chat_pipeline as cp_mod

    mock_tokens = ["에러", " 났어요"]

    async def fake_stream(messages, system_prompt, use_think):
        for t in mock_tokens:
            yield t

    mock_router = MagicMock()
    mock_router.source = "ollama"
    mock_router.stream = fake_stream
    mock_router.call_for_json = AsyncMock(return_value={})
    with patch.object(cp_mod, "llm_router", mock_router):
        response = await client.post(
            "/chat",
            json={"message": "도와줘", "conversation_id": None},
        )

    chunks = response.text.strip().split("\n\n")
    done_chunk = next(
        (c for c in chunks if '"type": "done"' in c or '"type":"done"' in c), None
    )
    assert done_chunk is not None
    done_data = json.loads(done_chunk.replace("data: ", "").strip())
    assert done_data["mood"] == "CONCERNED"


# ── /mood/stream 헤더 테스트 ─────────────────────────────────


@pytest.mark.asyncio
async def test_mood_stream_headers():
    """/mood/stream 응답에 SSE 필수 헤더가 포함돼야 한다."""
    from backend.routers.mood import mood_stream

    resp = await mood_stream()

    assert resp.media_type == "text/event-stream"
    assert resp.headers.get("cache-control") == "no-cache"
    assert resp.headers.get("x-accel-buffering") == "no"

    # 정리
    await resp.body_iterator.aclose()


@pytest.mark.asyncio
async def test_mood_stream_event_shape():
    """mood_change 이벤트가 AGENTS.md 9-1 계약 형식과 일치해야 한다."""
    import backend.services.mood as mood_mod
    from backend.routers.mood import mood_stream

    mood_mod._current_mood = "HAPPY"

    resp = await mood_stream()
    gen = resp.body_iterator

    chunk = await gen.__anext__()
    assert chunk.startswith("data:")
    event = json.loads(chunk[len("data:"):].strip())

    assert event["type"] == "mood_change"
    assert event["mood"] == "HAPPY"
    assert "updated_at" in event

    await gen.aclose()


# ── /settings/models 테스트 ──────────────────────────────────


@pytest.mark.asyncio
async def test_settings_models_scan_empty(client):
    """/settings/models — 모델 없을 때 빈 목록 반환."""
    with patch("backend.routers.settings._scan_models", return_value=[]):
        resp = await client.get("/settings/models")

    assert resp.status_code == 200
    data = resp.json()
    assert data["models"] == []
    assert data["current"] is None


@pytest.mark.asyncio
async def test_settings_models_scan_with_model(client):
    """/settings/models — 모델이 있으면 목록에 포함된다."""
    fake_models = [{"id": "nanoka", "path": "assets/character/nanoka/nanoka.model3.json", "name": "Nanoka"}]

    with patch("backend.routers.settings._scan_models", return_value=fake_models):
        resp = await client.get("/settings/models")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["models"]) == 1
    assert data["models"][0]["id"] == "nanoka"
    assert data["current"] == "nanoka"


@pytest.mark.asyncio
async def test_settings_models_select_valid(client):
    """/settings/models/select — 유효한 model_id면 success 반환 + push."""
    import backend.services.mood as mood_mod

    q = mood_mod.subscribe()
    fake_models = [{"id": "nanoka", "path": "assets/character/nanoka/nanoka.model3.json", "name": "Nanoka"}]

    with patch("backend.routers.settings._scan_models", return_value=fake_models):
        resp = await client.post("/settings/models/select", json={"model_id": "nanoka"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["current"] == "nanoka"

    event = q.get_nowait()
    assert event["type"] == "model_change"
    assert event["model_id"] == "nanoka"

    mood_mod.unsubscribe(q)


@pytest.mark.asyncio
async def test_settings_models_select_invalid(client):
    """/settings/models/select — 없는 model_id면 404 반환."""
    with patch("backend.routers.settings._scan_models", return_value=[]):
        resp = await client.post("/settings/models/select", json={"model_id": "ghost"})

    assert resp.status_code == 404
    data = resp.json()
    assert data["detail"]["code"] == "MODEL_NOT_FOUND"
