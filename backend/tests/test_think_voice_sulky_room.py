"""
think 동적 제어 / 음성 모드 / 삐짐 상태 / 룸 감지 테스트.

커버 범위:
- should_use_think: 캐주얼/코딩 메시지 판단
- postprocess_for_voice: 길이 제한, 이모지 제거
- sulky_service: trigger / resolve / check_reconcile / can_trigger 차단
- room_service: detect_room_type 키워드 분류
- build_system_prompt: 시스템 프롬프트 내용 검증
- /settings/persona preview 엔드포인트
- /chat: voice_mode=True → 후처리 응답, interaction_type 저장
"""

import json
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, AsyncMock as AM


# ── 공통 픽스처 ──────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def use_tmp_db(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test_hana.db")
    monkeypatch.setenv("DB_PATH", db_file)
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    import backend.routers.chat as chat_mod
    monkeypatch.setattr(chat_mod, "DB_PATH", db_file)
    import backend.routers.memory as mem_mod
    monkeypatch.setattr(mem_mod, "DB_PATH", db_file)
    import backend.services.proactive_service as svc_mod
    monkeypatch.setattr(svc_mod, "DB_PATH", db_file)


@pytest.fixture(autouse=True)
def mock_memory_service(monkeypatch):
    import backend.services.memory as svc_mod
    monkeypatch.setattr(svc_mod, "search_memory", AsyncMock(return_value=[]))
    monkeypatch.setattr(svc_mod, "update_confidence", AsyncMock())


@pytest.fixture(autouse=True)
def reset_mood():
    import backend.services.mood as mood_mod
    mood_mod._current_mood = "IDLE"
    yield
    mood_mod._current_mood = "IDLE"


@pytest.fixture(autouse=True)
def reset_sulky():
    import backend.services.sulky_service as sulky_mod
    sulky_mod._sulky = False
    sulky_mod._since = None
    yield
    sulky_mod._sulky = False
    sulky_mod._since = None


@pytest.fixture(autouse=True)
def reset_conversation_rooms():
    import backend.routers.chat as chat_mod
    chat_mod._conversation_rooms.clear()
    yield
    chat_mod._conversation_rooms.clear()


@pytest.fixture(autouse=True)
def reset_settings_cache(tmp_path, monkeypatch):
    """persona/챗모델 캐시와 settings.json 경로를 테스트용 임시 경로로 초기화한다."""
    from pathlib import Path
    import backend.services.settings_service as svc_mod
    svc_mod._persona_cache = None
    svc_mod._current_chat_model = None
    monkeypatch.setattr(svc_mod, "_SETTINGS_PATH", tmp_path / "settings.json")
    yield
    svc_mod._persona_cache = None
    svc_mod._current_chat_model = None


@pytest_asyncio.fixture
async def client(use_tmp_db, mock_memory_service):
    from backend.main import app
    from backend.models.schema import init_db
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


# ── should_use_think ────────────────────────────────────────────


def test_think_false_casual():
    """짧은 캐주얼 메시지는 think=False 여야 한다."""
    from backend.services.llm import should_use_think
    assert should_use_think("안녕") is False


def test_think_false_short_message():
    """15자 미만 메시지는 think=False."""
    from backend.services.llm import should_use_think
    assert should_use_think("뭐해?") is False


def test_think_true_coding_type():
    """interaction_type='coding'이면 항상 True."""
    from backend.services.llm import should_use_think
    assert should_use_think("안녕", interaction_type="coding") is True


def test_think_false_chat_type():
    """interaction_type='chat'이면 항상 False."""
    from backend.services.llm import should_use_think
    assert should_use_think("이 코드 왜 안돼?", interaction_type="chat") is False


def test_think_true_complex_keyword():
    """복잡한 키워드 포함 → True."""
    from backend.services.llm import should_use_think
    assert should_use_think("이 코드 왜 에러 나는 거야?") is True


def test_think_true_coding_keyword():
    """'코딩' 키워드 → True."""
    from backend.services.llm import should_use_think
    assert should_use_think("코딩 도와줘, 이 함수가 계속 틀려") is True


# ── postprocess_for_voice ───────────────────────────────────────


def test_voice_response_length():
    """50자 초과 텍스트는 첫 문장만 남겨 50자 이하로 줄인다."""
    from backend.services.llm import postprocess_for_voice
    long_text = "이건 첫 번째 문장이야. " + "추가 내용 " * 10
    result = postprocess_for_voice(long_text)
    assert len(result) <= 50


def test_voice_no_emoji():
    """이모지는 제거된다."""
    from backend.services.llm import postprocess_for_voice
    result = postprocess_for_voice("안녕 😊 반가워 🎉")
    assert "😊" not in result
    assert "🎉" not in result


def test_voice_no_markdown():
    """마크다운 기호(*, #, `)가 제거된다."""
    from backend.services.llm import postprocess_for_voice
    result = postprocess_for_voice("**굵게** `코드` # 제목")
    assert "*" not in result
    assert "`" not in result
    assert "#" not in result


def test_voice_short_text_unchanged():
    """50자 이하는 그대로 반환된다 (특수문자 제거 후)."""
    from backend.services.llm import postprocess_for_voice
    short = "안녕, 잘 지냈어?"
    result = postprocess_for_voice(short)
    assert "안녕" in result


# ── sulky_service ───────────────────────────────────────────────


def test_sulky_initial_false():
    """초기 상태는 삐짐 아님."""
    from backend.services.sulky_service import is_sulky
    assert is_sulky() is False


def test_sulky_trigger():
    """trigger_sulky() 호출 후 is_sulky() == True."""
    from backend.services.sulky_service import is_sulky, trigger_sulky
    trigger_sulky()
    assert is_sulky() is True


def test_sulky_resolve():
    """resolve_sulky() 호출 후 is_sulky() == False."""
    from backend.services.sulky_service import is_sulky, resolve_sulky, trigger_sulky
    trigger_sulky()
    resolve_sulky()
    assert is_sulky() is False


def test_reconcile_resolves_sulky():
    """'미안해' 메시지가 삐짐 상태를 해제한다."""
    from backend.services.sulky_service import check_reconcile, is_sulky, trigger_sulky
    trigger_sulky()
    result = check_reconcile("미안해, 내가 잘못했어")
    assert result is True
    assert is_sulky() is False


def test_reconcile_no_keyword():
    """화해 키워드 없으면 삐짐 상태 유지."""
    from backend.services.sulky_service import check_reconcile, is_sulky, trigger_sulky
    trigger_sulky()
    result = check_reconcile("그냥 얘기해줘")
    assert result is False
    assert is_sulky() is True


@pytest.mark.asyncio
async def test_sulky_blocks_proactive(use_tmp_db):
    """삐짐 상태에서 autonomous_talk는 차단된다."""
    from backend.services.sulky_service import trigger_sulky
    from backend.services.proactive_service import can_trigger
    trigger_sulky()
    result = await can_trigger("autonomous_talk")
    assert result is False


@pytest.mark.asyncio
async def test_sulky_allows_exceptions(use_tmp_db):
    """삐짐 상태에서도 late_night는 허용된다."""
    from backend.models.schema import init_db
    from backend.services.sulky_service import trigger_sulky
    from backend.services.proactive_service import can_trigger
    await init_db()
    trigger_sulky()
    result = await can_trigger("late_night")
    assert result is True


# ── room_service ────────────────────────────────────────────────


def test_room_coding():
    """'코드 버그' 메시지 → 'coding'."""
    from backend.services.room_service import detect_room_type
    assert detect_room_type("이 코드 버그 있어") == "coding"


def test_room_game():
    """'게임' 메시지 → 'game'."""
    from backend.services.room_service import detect_room_type
    assert detect_room_type("게임하자") == "game"


def test_room_general():
    """키워드 없음 → 'general'."""
    from backend.services.room_service import detect_room_type
    assert detect_room_type("오늘 날씨 어때?") == "general"


def test_room_autonomous_context():
    """autonomous_context에 '코딩' 포함 → 'coding'."""
    from backend.services.room_service import detect_room_type
    assert detect_room_type("안녕", autonomous_context="코딩 중") == "coding"


# ── build_system_prompt ─────────────────────────────────────────


def test_system_prompt_clean():
    """
    기본 프롬프트가 자연어 말투 지시를 포함하고
    '안녕하세요' 같은 공식체 시작 문구를 권장하지 않아야 한다.
    (프롬프트 자체에 금지 예시 단어가 포함될 수 있으므로
     '절대 금지' 섹션의 존재 여부와 핵심 지시 내용으로 검증한다.)
    """
    from backend.services.llm import build_system_prompt
    prompt = build_system_prompt()
    # 자연어 말투 지시가 있어야 함
    assert "말투 규칙" in prompt
    # 금지 목록이 명시되어 있어야 함
    assert "절대 금지" in prompt
    # Good/Bad 예시가 있어야 함
    assert "Good:" in prompt
    assert "Bad:" in prompt


def test_system_prompt_sulky():
    """삐짐 상태 프롬프트에 삐짐 지시문이 포함된다."""
    from backend.services.llm import build_system_prompt
    prompt = build_system_prompt(sulky=True)
    assert "삐진 상태" in prompt


def test_system_prompt_voice_mode():
    """voice_mode=True이면 음성 모드 지시문이 포함된다."""
    from backend.services.llm import build_system_prompt
    prompt = build_system_prompt(voice_mode=True)
    assert "음성 모드" in prompt


def test_system_prompt_persona_name():
    """persona의 ai_name이 프롬프트에 반영된다."""
    from backend.services.llm import build_system_prompt
    prompt = build_system_prompt(persona={"ai_name": "루나"})
    assert "루나" in prompt


def test_system_prompt_memories():
    """memories 목록이 프롬프트에 포함된다."""
    from backend.services.llm import build_system_prompt
    prompt = build_system_prompt(memories=["오너는 Python을 좋아함"])
    assert "Python을 좋아함" in prompt


# ── /chat 엔드포인트 통합 테스트 ────────────────────────────────


@pytest.mark.asyncio
async def test_chat_voice_mode_short_response(client):
    """voice_mode=True이면 응답이 후처리되어 짧아진다."""
    long_response = "이건 첫 번째 문장이야. " + "추가 내용 " * 10

    async def mock_stream(*args, **kwargs):
        yield long_response

    with patch("backend.routers.chat.stream_chat", side_effect=mock_stream):
        resp = await client.post(
            "/chat",
            json={"message": "안녕", "voice_mode": True},
        )

    assert resp.status_code == 200
    events = parse_sse(resp.text)
    tokens = [e for e in events if e.get("type") == "token"]
    assert len(tokens) == 1
    assert len(tokens[0]["content"]) <= 50


@pytest.mark.asyncio
async def test_chat_interaction_type_saved(client):
    """interaction_type이 DB messages 테이블에 저장된다."""
    import aiosqlite
    from backend.models.schema import DB_PATH as db_path

    async def mock_stream(*args, **kwargs):
        yield "응답"

    with patch("backend.routers.chat.stream_chat", side_effect=mock_stream):
        resp = await client.post(
            "/chat",
            json={"message": "버그 있어", "interaction_type": "coding"},
        )

    assert resp.status_code == 200
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT interaction_type FROM messages WHERE role='user' LIMIT 1"
        ) as cur:
            row = await cur.fetchone()
    assert row is not None
    assert row[0] == "coding"


@pytest.mark.asyncio
async def test_chat_room_change_event(client):
    """룸 타입이 바뀌면 room_change 이벤트가 SSE에 포함된다."""
    async def mock_stream(*args, **kwargs):
        yield "응답"

    # 첫 요청 (general)
    with patch("backend.routers.chat.stream_chat", side_effect=mock_stream):
        await client.post("/chat", json={"message": "안녕"})

    # 두 번째 요청 (coding으로 변경)
    async def mock_stream2(*args, **kwargs):
        yield "응답"

    with patch("backend.routers.chat.stream_chat", side_effect=mock_stream2):
        resp = await client.post(
            "/chat",
            json={"message": "이 코드 버그 있어"},
        )

    events = parse_sse(resp.text)
    room_events = [e for e in events if e.get("type") == "room_change"]
    assert len(room_events) == 1
    assert room_events[0]["room_type"] == "coding"


# ── /settings/persona 엔드포인트 ────────────────────────────────


@pytest.mark.asyncio
async def test_persona_get_default(client):
    """GET /settings/persona 기본값 반환."""
    resp = await client.get("/settings/persona")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ai_name"] == "하나"
    assert "speech_preset" in data


@pytest.mark.asyncio
async def test_persona_post_and_get(client):
    """POST /settings/persona 저장 후 GET으로 확인."""
    payload = {
        "ai_name": "루나",
        "owner_nickname": "자기야",
        "speech_preset": "cheerful_girl",
        "personality_preset": "warm",
        "interests": "게임이랑 코딩",
    }
    resp = await client.post("/settings/persona", json=payload)
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    resp2 = await client.get("/settings/persona")
    data = resp2.json()
    assert data["ai_name"] == "루나"
    assert data["owner_nickname"] == "자기야"


@pytest.mark.asyncio
async def test_persona_preview(client):
    """POST /settings/persona/preview → 3개 샘플 반환."""

    async def mock_complete(*args, **kwargs):
        return "뭐야, 왜 봐."

    with patch("backend.routers.settings.complete_chat", side_effect=mock_complete):
        resp = await client.post(
            "/settings/persona/preview",
            json={"speech_preset": "tsundere", "personality_preset": "playful"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "samples" in data
    assert len(data["samples"]) == 3


# ── Ollama think:True 직접 테스트 (mock) ────────────────────────


@pytest.mark.asyncio
async def test_think_true_ollama_mock():
    """stream_chat에서 think:True payload로 호출 시 thinking 청크를 skip하고 content만 yield한다."""
    import asyncio
    from unittest.mock import MagicMock, patch

    thinking_chunk = json.dumps({
        "message": {"role": "assistant", "content": "", "thinking": "내가 생각하고 있어"},
        "done": False,
    })
    content_chunk = json.dumps({
        "message": {"role": "assistant", "content": "안녕!"},
        "done": False,
    })
    done_chunk = json.dumps({
        "message": {"role": "assistant", "content": ""},
        "done": True,
    })

    async def mock_aiter_lines():
        for line in [thinking_chunk, content_chunk, done_chunk]:
            yield line

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.aiter_lines = mock_aiter_lines

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def mock_stream_ctx(*args, **kwargs):
        yield mock_response

    mock_client = MagicMock()
    mock_client.stream = mock_stream_ctx

    @asynccontextmanager
    async def mock_async_client(*args, **kwargs):
        yield mock_client

    from backend.services.llm import stream_chat

    with patch("backend.services.llm.httpx.AsyncClient", mock_async_client):
        tokens = []
        async for token in stream_chat(
            [{"role": "user", "content": "안녕"}],
            use_think=True,
        ):
            tokens.append(token)

    assert tokens == ["안녕!"]  # thinking 청크 제외, content만
