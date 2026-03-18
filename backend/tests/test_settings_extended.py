"""
settings 확장 테스트.
- PMX 모델 스캔 (type 필드 포함)
- LLM 모델 목록 / 선택 API
- settings_service in-memory + settings.json 동작

Ollama 호출은 전부 mock으로 대체한다.
"""

import json
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock


# ── 공통 픽스처 ──────────────────────────────────────────────


@pytest.fixture(autouse=True)
def use_tmp_db(tmp_path, monkeypatch):
    """각 테스트마다 임시 SQLite DB 사용."""
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
    """memory 서비스 no-op mock."""
    import backend.services.memory as svc_mod
    monkeypatch.setattr(svc_mod, "search_memory", AsyncMock(return_value=[]))
    monkeypatch.setattr(svc_mod, "update_confidence", AsyncMock())


@pytest.fixture(autouse=True)
def reset_mood():
    """각 테스트 전후 무드 상태 초기화."""
    import backend.services.mood as mood_mod
    mood_mod._current_mood = "IDLE"
    mood_mod._subscribers.clear()
    yield
    mood_mod._subscribers.clear()


@pytest.fixture(autouse=True)
def reset_settings_service(monkeypatch):
    """각 테스트 전후 settings_service in-memory 상태 초기화."""
    import backend.services.settings_service as svc
    monkeypatch.setattr(svc, "_current_chat_model", None)
    yield
    # 모듈 상태 복원
    svc._current_chat_model = None


@pytest.fixture(autouse=True)
def reset_character_model(monkeypatch):
    """각 테스트 전후 캐릭터 모델 in-memory 상태 초기화."""
    import backend.routers.settings as settings_mod
    monkeypatch.setattr(settings_mod, "_current_character_model_id", None)


@pytest_asyncio.fixture
async def client():
    from backend.main import app
    from backend.models.schema import init_db
    await init_db()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


# ── 캐릭터 모델 스캔 테스트 ──────────────────────────────────────


def _make_character_dir(tmp_path: Path, folder: str, filenames: list[str]) -> Path:
    """assets/character/{folder}/ 를 tmp_path 아래 만들고 파일 목록을 생성한다."""
    d = tmp_path / "assets" / "character" / folder
    d.mkdir(parents=True)
    for fname in filenames:
        (d / fname).touch()
    return d


@pytest.mark.asyncio
async def test_settings_models_includes_pmx(tmp_path, monkeypatch, client):
    """PMX 파일이 있는 폴더가 GET /settings/models 에 type=pmx 로 포함되어야 한다."""
    import backend.routers.settings as settings_mod

    char_root = tmp_path / "assets" / "character"
    char_root.mkdir(parents=True)
    pmx_dir = char_root / "furina"
    pmx_dir.mkdir()
    (pmx_dir / "furina.pmx").touch()

    monkeypatch.setattr(settings_mod, "_CHARACTER_ROOT", char_root)

    resp = await client.get("/settings/models")
    assert resp.status_code == 200
    data = resp.json()

    assert len(data["models"]) == 1
    model = data["models"][0]
    assert model["id"] == "furina"
    assert model["type"] == "pmx"
    assert model["path"].endswith(".pmx")


@pytest.mark.asyncio
async def test_settings_models_type_detection(tmp_path, monkeypatch, client):
    """live2d 폴더 → live2d, pmx 폴더 → pmx, 둘 다 있으면 → live2d 우선."""
    import backend.routers.settings as settings_mod

    char_root = tmp_path / "assets" / "character"

    # live2d only
    d1 = char_root / "nanoka"
    d1.mkdir(parents=True)
    (d1 / "nanoka.model3.json").touch()

    # pmx only
    d2 = char_root / "furina"
    d2.mkdir(parents=True)
    (d2 / "furina.pmx").touch()

    # both → live2d wins
    d3 = char_root / "mixed"
    d3.mkdir(parents=True)
    (d3 / "mixed.model3.json").touch()
    (d3 / "mixed.pmx").touch()

    # neither → skipped
    d4 = char_root / "empty"
    d4.mkdir(parents=True)

    monkeypatch.setattr(settings_mod, "_CHARACTER_ROOT", char_root)

    resp = await client.get("/settings/models")
    assert resp.status_code == 200
    models = {m["id"]: m for m in resp.json()["models"]}

    assert models["nanoka"]["type"] == "live2d"
    assert models["furina"]["type"] == "pmx"
    assert models["mixed"]["type"] == "live2d"   # live2d 우선
    assert "empty" not in models                 # 건너뜀


# ── LLM 모델 목록 테스트 ────────────────────────────────────────


_FAKE_TAGS = {
    "models": [
        {"name": "qwen3:14b"},
        {"name": "qwen3:4b"},
        {"name": "qwen3-vl:8b"},
    ]
}


@pytest.mark.asyncio
async def test_settings_models_nested_structure(tmp_path, monkeypatch, client):
    """중첩 폴더 안에 있는 모델 파일도 탐색돼야 한다."""
    import backend.routers.settings as settings_mod

    char_root = tmp_path / "assets" / "character"

    # live2d 파일이 하위 폴더 안에 있는 경우
    d1 = char_root / "nanoka"
    (d1 / "runtime").mkdir(parents=True)
    (d1 / "runtime" / "nanoka.model3.json").touch()

    # pmx 파일이 하위 폴더 안에 있는 경우
    d2 = char_root / "furina"
    (d2 / "model").mkdir(parents=True)
    (d2 / "model" / "furina.pmx").touch()

    monkeypatch.setattr(settings_mod, "_CHARACTER_ROOT", char_root)

    resp = await client.get("/settings/models")
    assert resp.status_code == 200
    models = {m["id"]: m for m in resp.json()["models"]}

    assert models["nanoka"]["type"] == "live2d"
    assert "runtime/nanoka.model3.json" in models["nanoka"]["path"]
    assert models["furina"]["type"] == "pmx"
    assert "model/furina.pmx" in models["furina"]["path"]


@pytest.mark.asyncio
async def test_llm_models_list(monkeypatch, client):
    """GET /settings/llm/models — Ollama mock 응답 기반 모델 목록 반환."""
    import backend.routers.settings as settings_mod
    monkeypatch.setattr(
        settings_mod, "_fetch_ollama_models",
        AsyncMock(return_value=["qwen3:14b", "qwen3:4b", "qwen3-vl:8b"]),
    )
    monkeypatch.setenv("OLLAMA_WORKER_MODEL", "qwen3:4b")
    monkeypatch.setenv("OLLAMA_VISION_MODEL", "qwen3-vl:8b")
    monkeypatch.setattr(settings_mod, "_WORKER_MODEL", "qwen3:4b")
    monkeypatch.setattr(settings_mod, "_VISION_MODEL", "qwen3-vl:8b")

    resp = await client.get("/settings/llm/models")
    assert resp.status_code == 200
    data = resp.json()

    assert data["current_chat_model"] == "qwen3:14b"  # env var default

    by_id = {m["id"]: m for m in data["models"]}
    assert by_id["qwen3:14b"]["role"] == "chat"
    assert by_id["qwen3:4b"]["role"] == "worker"
    assert by_id["qwen3-vl:8b"]["role"] == "vision"
    assert by_id["qwen3:14b"]["current"] is True
    assert by_id["qwen3:4b"]["current"] is False


# ── LLM 모델 선택 테스트 ────────────────────────────────────────


@pytest.mark.asyncio
async def test_llm_select_valid_model(tmp_path, monkeypatch, client):
    """POST /settings/llm/select — 유효한 모델 선택 시 success + settings.json 저장."""
    import backend.routers.settings as settings_mod
    import backend.services.settings_service as svc

    monkeypatch.setattr(
        settings_mod, "_fetch_ollama_models",
        AsyncMock(return_value=["qwen3:14b", "qwen3:4b"]),
    )

    settings_json = tmp_path / "settings.json"
    monkeypatch.setattr(svc, "_SETTINGS_PATH", settings_json)

    resp = await client.post("/settings/llm/select", json={"model_id": "qwen3:14b"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["current_chat_model"] == "qwen3:14b"

    # settings.json에 저장됐는지 확인
    assert settings_json.exists()
    saved = json.loads(settings_json.read_text())
    assert saved["current_chat_model"] == "qwen3:14b"


@pytest.mark.asyncio
async def test_llm_select_invalid_model(monkeypatch, client):
    """POST /settings/llm/select — Ollama에 없는 모델 → MODEL_NOT_FOUND 에러."""
    import backend.routers.settings as settings_mod
    monkeypatch.setattr(
        settings_mod, "_fetch_ollama_models",
        AsyncMock(return_value=["qwen3:14b"]),
    )

    resp = await client.post("/settings/llm/select", json={"model_id": "nonexistent:7b"})
    assert resp.status_code == 404
    detail = resp.json()["detail"]
    assert detail["error"] is True
    assert detail["code"] == "MODEL_NOT_FOUND"


# ── settings_service in-memory + settings.json 테스트 ─────────────


def test_llm_service_reads_settings_json(tmp_path, monkeypatch):
    """settings.json에 모델이 있으면 env var보다 우선해야 한다."""
    import backend.services.settings_service as svc

    settings_json = tmp_path / "settings.json"
    settings_json.write_text(json.dumps({"current_chat_model": "qwen3:4b"}))

    monkeypatch.setattr(svc, "_SETTINGS_PATH", settings_json)
    monkeypatch.setattr(svc, "_current_chat_model", None)  # in-memory 비어있음
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3:14b")        # env var는 14b

    result = svc.get_current_chat_model()
    assert result == "qwen3:4b"  # settings.json 값 사용


def test_llm_service_in_memory_overrides_settings_json(tmp_path, monkeypatch):
    """in-memory 값이 있으면 settings.json보다 우선해야 한다."""
    import backend.services.settings_service as svc

    settings_json = tmp_path / "settings.json"
    settings_json.write_text(json.dumps({"current_chat_model": "qwen3:4b"}))

    monkeypatch.setattr(svc, "_SETTINGS_PATH", settings_json)
    monkeypatch.setattr(svc, "_current_chat_model", "qwen3:14b")  # in-memory 있음

    result = svc.get_current_chat_model()
    assert result == "qwen3:14b"  # in-memory 값 사용
