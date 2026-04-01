"""
/voice/stt, /voice/tts 엔드포인트 테스트.
Whisper와 Kokoro 모두 mock 처리 — 실제 모델 호출 없음.
"""

import io
import wave
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app
from backend.models.schema import init_db


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


def _make_wav_bytes() -> bytes:
    """테스트용 더미 WAV bytes 생성."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"\x00" * 3200)  # 0.1초 묵음
    return buf.getvalue()


# ─── STT ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stt_happy_path():
    """STT: WAV 업로드 시 text/confidence 반환."""
    with patch(
        "backend.services.voice_input.transcribe",
        return_value=("하나야 안녕", 0.95),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            resp = await ac.post(
                "/voice/stt",
                files={"audio": ("test.wav", _make_wav_bytes(), "audio/wav")},
            )
    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "하나야 안녕"
    assert body["confidence"] == pytest.approx(0.95)


@pytest.mark.asyncio
async def test_stt_service_error_returns_503():
    """STT: transcribe 실패 시 503 반환."""
    with patch(
        "backend.services.voice_input.transcribe",
        side_effect=RuntimeError("whisper 오류"),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            resp = await ac.post(
                "/voice/stt",
                files={"audio": ("test.wav", _make_wav_bytes(), "audio/wav")},
            )
    assert resp.status_code == 503


# ─── TTS ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tts_happy_path():
    """TTS: 텍스트 전송 시 audio/wav 반환."""
    dummy_wav = _make_wav_bytes()
    with (
        patch("backend.services.voice_output.is_available", return_value=True),
        patch("backend.services.voice_output.synthesize", return_value=dummy_wav),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            resp = await ac.post(
                "/voice/tts",
                json={"text": "안녕하세요", "mood": "HAPPY"},
            )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert len(resp.content) > 0


@pytest.mark.asyncio
async def test_tts_model_not_found_returns_503():
    """TTS: 모델 파일 없을 때 503 반환."""
    with patch("backend.services.voice_output.is_available", return_value=False):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            resp = await ac.post(
                "/voice/tts",
                json={"text": "안녕", "mood": "IDLE"},
            )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_tts_empty_text_returns_400():
    """TTS: 빈 텍스트 전송 시 400 반환."""
    with patch("backend.services.voice_output.is_available", return_value=True):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            resp = await ac.post(
                "/voice/tts",
                json={"text": "   ", "mood": "IDLE"},
            )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_tts_uses_mood_speed():
    """TTS: mood에 따라 speed가 달라지는지 확인 (HAPPY → speed > 1.0)."""
    dummy_wav = _make_wav_bytes()
    captured: dict = {}

    def fake_synthesize(text: str, speed: float = 1.0, voice=None) -> bytes:
        captured["speed"] = speed
        return dummy_wav

    with (
        patch("backend.services.voice_output.is_available", return_value=True),
        patch("backend.services.voice_output.synthesize", side_effect=fake_synthesize),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            await ac.post("/voice/tts", json={"text": "테스트", "mood": "HAPPY"})

    assert captured.get("speed", 1.0) > 1.0


@pytest.mark.asyncio
async def test_tts_explicit_speed_overrides_mood():
    """TTS: speed 명시 시 mood speed 무시."""
    dummy_wav = _make_wav_bytes()
    captured: dict = {}

    def fake_synthesize(text: str, speed: float = 1.0, voice=None) -> bytes:
        captured["speed"] = speed
        return dummy_wav

    with (
        patch("backend.services.voice_output.is_available", return_value=True),
        patch("backend.services.voice_output.synthesize", side_effect=fake_synthesize),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            await ac.post(
                "/voice/tts",
                json={"text": "테스트", "mood": "HAPPY", "speed": 0.8},
            )

    assert captured.get("speed") == pytest.approx(0.8)
