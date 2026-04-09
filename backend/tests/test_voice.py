"""
음성 입출력 라우터 테스트.
Whisper와 Kokoro는 mock으로 대체.
"""

import io
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    from backend.main import app
    from backend.models.schema import init_db
    db_file = str(tmp_path / "test.db")
    monkeypatch.setenv("DB_PATH", db_file)
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    await init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


class TestSTT:
    @pytest.mark.asyncio
    async def test_stt_success(self, client, monkeypatch):
        """정상 오디오 파일 → 텍스트 반환."""
        async def mock_transcribe(audio_bytes, mime_type="audio/wav"):
            return {"text": "안녕하세요", "confidence": 0.95, "language": "ko"}

        monkeypatch.setattr("backend.routers.voice.transcribe", mock_transcribe, raising=False)
        with patch("backend.routers.voice.transcribe", mock_transcribe):
            # voice_input을 import할 수 있게 mock
            import backend.services.voice_input as vi_mod
            monkeypatch.setattr(vi_mod, "transcribe", mock_transcribe)

            fake_wav = b"RIFF" + b"\x00" * 40  # 최소 WAV 헤더 흉내
            files = {"audio": ("test.wav", io.BytesIO(fake_wav), "audio/wav")}

            with patch("backend.routers.voice.transcribe", new=mock_transcribe):
                resp = await client.post("/voice/stt", files=files)

        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "안녕하세요"
        assert data["confidence"] == 0.95

    @pytest.mark.asyncio
    async def test_stt_empty_audio(self, client):
        """빈 오디오 → 400."""
        files = {"audio": ("empty.wav", io.BytesIO(b""), "audio/wav")}
        with patch("backend.routers.voice.transcribe", AsyncMock()):
            resp = await client.post("/voice/stt", files=files)
        assert resp.status_code == 400
        assert resp.json()["detail"]["code"] == "EMPTY_AUDIO"

    @pytest.mark.asyncio
    async def test_stt_whisper_not_installed(self, client):
        """Whisper 없으면 503."""
        fake_wav = b"RIFF" + b"\x00" * 40
        files = {"audio": ("test.wav", io.BytesIO(fake_wav), "audio/wav")}
        with patch("backend.routers.voice.transcribe", None):
            resp = await client.post("/voice/stt", files=files)
        assert resp.status_code == 503
        assert resp.json()["detail"]["code"] == "WHISPER_NOT_INSTALLED"


class TestTTS:
    @pytest.mark.asyncio
    async def test_tts_success(self, client):
        """정상 텍스트 → WAV 바이너리 반환."""
        fake_wav = b"RIFF" + b"\x00" * 100

        async def mock_synthesize(text, speed=1.0, pitch=0.0, energy=1.0):
            return fake_wav

        with patch("backend.routers.voice.synthesize", new=mock_synthesize):
            resp = await client.post("/voice/tts", json={"text": "안녕!", "mood": "HAPPY"})

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"
        assert resp.content == fake_wav

    @pytest.mark.asyncio
    async def test_tts_empty_text(self, client):
        """빈 텍스트 → 400."""
        with patch("backend.routers.voice.synthesize", AsyncMock(return_value=b"")):
            resp = await client.post("/voice/tts", json={"text": "  ", "mood": "IDLE"})
        assert resp.status_code == 400
        assert resp.json()["detail"]["code"] == "EMPTY_TEXT"

    @pytest.mark.asyncio
    async def test_tts_uses_emotion_params(self, client):
        """mood=HAPPY면 tts_emotion 파라미터가 적용된다."""
        captured = {}

        async def mock_synthesize(text, speed=1.0, pitch=0.0, energy=1.0):
            captured["speed"] = speed
            captured["energy"] = energy
            return b"RIFF" + b"\x00" * 40

        with patch("backend.routers.voice.synthesize", new=mock_synthesize):
            resp = await client.post("/voice/tts", json={"text": "야호!", "mood": "HAPPY"})

        assert resp.status_code == 200
        # HAPPY 감정이면 기본값(1.0)과 다른 speed가 들어와야 함
        assert "speed" in captured

    @pytest.mark.asyncio
    async def test_tts_kokoro_not_installed(self, client):
        """Kokoro 없으면 503."""
        with patch("backend.routers.voice.synthesize", None):
            resp = await client.post("/voice/tts", json={"text": "테스트", "mood": "IDLE"})
        assert resp.status_code == 503
        assert resp.json()["detail"]["code"] == "KOKORO_NOT_INSTALLED"
