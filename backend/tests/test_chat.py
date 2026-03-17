"""
/chat, /history, /conversations 엔드포인트 테스트.
Ollama는 mock으로 대체한다 — 실제 LLM 호출 없음.
"""

import json
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch


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


@pytest.fixture(autouse=True)
def mock_memory_service(monkeypatch):
    """search_memory와 update_confidence를 no-op mock으로 대체한다."""
    import backend.services.memory as svc_mod
    monkeypatch.setattr(svc_mod, "search_memory", AsyncMock(return_value=[]))
    monkeypatch.setattr(svc_mod, "update_confidence", AsyncMock())


@pytest_asyncio.fixture
async def client(use_tmp_db, mock_memory_service):
    from backend.main import app
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# 헬퍼: SSE 응답 파싱
# ---------------------------------------------------------------------------

def parse_sse(text: str) -> list[dict]:
    events = []
    for line in text.splitlines():
        if line.startswith("data: ") and line != "data: [DONE]":
            events.append(json.loads(line[6:]))
    return events


# ---------------------------------------------------------------------------
# /chat — happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_happy_path(client):
    """정상 메시지 → SSE 스트림에 token 이벤트와 done 이벤트가 포함된다."""

    async def fake_stream(messages, memory_context=None):
        for tok in ["안", "녕", "!"]:
            yield tok

    with patch("backend.routers.chat.stream_chat", side_effect=fake_stream):
        resp = await client.post("/chat", json={"message": "하나야 안녕"})

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    events = parse_sse(resp.text)
    token_events = [e for e in events if e["type"] == "token"]
    done_events = [e for e in events if e["type"] == "done"]

    assert len(token_events) == 3
    assert "".join(e["content"] for e in token_events) == "안녕!"
    assert len(done_events) == 1
    assert "conversation_id" in done_events[0]
    assert "message_id" in done_events[0]
    assert done_events[0]["mood"] == "IDLE"


# ---------------------------------------------------------------------------
# /chat — conversation_id 재사용
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_reuses_conversation_id(client):
    """conversation_id를 지정하면 같은 세션으로 이어진다."""

    async def fake_stream(messages, memory_context=None):
        yield "응"

    conv_id = "test-conv-0001"
    with patch("backend.routers.chat.stream_chat", side_effect=fake_stream):
        resp = await client.post(
            "/chat", json={"message": "안녕", "conversation_id": conv_id}
        )

    events = parse_sse(resp.text)
    done = next(e for e in events if e["type"] == "done")
    assert done["conversation_id"] == conv_id


# ---------------------------------------------------------------------------
# /chat — 빈 메시지 → 에러
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_empty_message_returns_error(client):
    """빈 메시지 요청은 400을 반환한다."""
    resp = await client.post("/chat", json={"message": "   "})
    assert resp.status_code == 400
    body = resp.json()
    assert body["detail"]["code"] == "EMPTY_MESSAGE"


# ---------------------------------------------------------------------------
# /chat — Ollama 장애 → SSE error 이벤트
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_llm_unavailable(client):
    """Ollama 연결 실패 시 SSE error 이벤트를 반환한다."""

    async def fail_stream(messages, memory_context=None):
        raise RuntimeError("Ollama 연결 실패")
        yield  # AsyncGenerator 타입 만족

    with patch("backend.routers.chat.stream_chat", side_effect=fail_stream):
        resp = await client.post("/chat", json={"message": "안녕"})

    assert resp.status_code == 200
    events = parse_sse(resp.text)
    error_events = [e for e in events if e["type"] == "error"]
    assert len(error_events) == 1
    assert error_events[0]["code"] == "LLM_UNAVAILABLE"


# ---------------------------------------------------------------------------
# /history
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_history_returns_messages(client):
    """대화 후 /history로 메시지를 조회할 수 있다."""

    async def fake_stream(messages, memory_context=None):
        yield "응답이야"

    with patch("backend.routers.chat.stream_chat", side_effect=fake_stream):
        resp = await client.post("/chat", json={"message": "테스트"})

    events = parse_sse(resp.text)
    conv_id = next(e for e in events if e["type"] == "done")["conversation_id"]

    hist = await client.get(f"/history?conversation_id={conv_id}")
    assert hist.status_code == 200
    data = hist.json()
    assert data["conversation_id"] == conv_id
    assert len(data["messages"]) == 2  # user + assistant
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][1]["role"] == "assistant"


# ---------------------------------------------------------------------------
# /conversations
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_conversations_list(client):
    """대화 후 /conversations에서 세션이 조회된다."""

    async def fake_stream(messages, memory_context=None):
        yield "응"

    with patch("backend.routers.chat.stream_chat", side_effect=fake_stream):
        await client.post("/chat", json={"message": "안녕"})

    resp = await client.get("/conversations")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["conversations"]) >= 1


# ---------------------------------------------------------------------------
# /feedback
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_feedback_success(client):
    """정상 피드백 요청은 success: true를 반환한다."""

    async def fake_stream(messages, memory_context=None):
        yield "응"

    with patch("backend.routers.chat.stream_chat", side_effect=fake_stream):
        chat_resp = await client.post("/chat", json={"message": "테스트"})

    events = parse_sse(chat_resp.text)
    msg_id = next(e for e in events if e["type"] == "done")["message_id"]

    fb = await client.post("/feedback", json={"message_id": msg_id, "score": 5})
    assert fb.status_code == 200
    assert fb.json()["success"] is True


@pytest.mark.asyncio
async def test_feedback_invalid_score(client):
    """범위 벗어난 score는 400을 반환한다."""
    resp = await client.post("/feedback", json={"message_id": "any", "score": 10})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# /mood
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_mood_returns_idle(client):
    """/mood는 기본 IDLE 무드를 반환한다."""
    resp = await client.get("/mood")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mood"] == "IDLE"
    assert "updated_at" in data
