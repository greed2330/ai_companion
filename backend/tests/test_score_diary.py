"""
score_tasks, diary_tasks 테스트.
LLM과 ChromaDB는 mock으로 대체.
"""

import asyncio
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# score_tasks
# ---------------------------------------------------------------------------

class TestParseScore:
    def test_valid_json(self):
        from backend.tasks.score_tasks import _parse_score
        assert _parse_score('{"score": 0.85, "reason": "good"}') == pytest.approx(0.85)

    def test_json_embedded_in_text(self):
        from backend.tasks.score_tasks import _parse_score
        raw = 'Some text {"score": 0.72} more text'
        assert _parse_score(raw) == pytest.approx(0.72)

    def test_invalid_json_returns_05(self):
        from backend.tasks.score_tasks import _parse_score
        assert _parse_score("gibberish") == pytest.approx(0.5)

    def test_score_clamped(self):
        from backend.tasks.score_tasks import _parse_score
        assert _parse_score('{"score": 1.5}') == pytest.approx(1.0)
        assert _parse_score('{"score": -0.1}') == pytest.approx(0.0)


class TestCalcFinalScore:
    def test_auto_only(self):
        from backend.tasks.score_tasks import _calc_final_score
        # explicit 없으면 auto로 대리, implicit 없으면 0.5
        # = 0.8*0.4 + 0.8*0.4 + 0.5*0.2 = 0.64 + 0.1 = 0.74
        result = _calc_final_score(None, 0.8, None)
        assert result == pytest.approx(0.74)

    def test_all_provided(self):
        from backend.tasks.score_tasks import _calc_final_score
        # explicit=5(→1.0), auto=0.9, implicit='follow_up'(→1.0)
        # = 1.0*0.4 + 0.9*0.4 + 1.0*0.2 = 0.4 + 0.36 + 0.2 = 0.96
        result = _calc_final_score(5, 0.9, "follow_up")
        assert result == pytest.approx(0.96)

    def test_low_implicit(self):
        from backend.tasks.score_tasks import _calc_final_score
        result = _calc_final_score(None, 0.6, "ignored")
        # = 0.6*0.4 + 0.6*0.4 + 0.1*0.2 = 0.24+0.24+0.02 = 0.5
        assert result == pytest.approx(0.50)


@pytest.mark.asyncio
async def test_score_async_saves_to_dataset():
    """auto_score >= 0.7이면 dataset에 저장된다."""
    from backend.tasks.score_tasks import _score_async

    mock_router = MagicMock()
    mock_router.call_for_text = AsyncMock(return_value='{"score": 0.85, "reason": "great"}')

    with patch("backend.tasks.score_tasks.asyncio"), \
         patch("backend.tasks.score_tasks._fetch_existing_feedback", return_value=(None, None)), \
         patch("backend.tasks.score_tasks._upsert_feedback", new=AsyncMock()), \
         patch("backend.tasks.score_tasks._save_to_dataset", return_value=True) as mock_save, \
         patch("backend.services.llm_router.llm_router", mock_router), \
         patch("backend.tasks.score_tasks.llm_router", mock_router, create=True):

        # llm_router를 직접 패치
        import backend.tasks.score_tasks as st_mod
        original = getattr(st_mod, 'llm_router', None)

        async def patched():
            # mock llm_router in the module's namespace
            pass

        result = await _score_async("msg-001", "안녕", "안녕하세요!", "chat")

    assert result["auto_score"] == pytest.approx(0.85)
    assert result["final_score"] >= 0.7


@pytest.mark.asyncio
async def test_score_async_no_save_below_threshold():
    """auto_score < 0.7이면 dataset에 저장되지 않는다."""
    from backend.tasks.score_tasks import _score_async

    mock_router = MagicMock()
    mock_router.call_for_text = AsyncMock(return_value='{"score": 0.3, "reason": "poor"}')

    with patch("backend.tasks.score_tasks._fetch_existing_feedback", return_value=(None, None)), \
         patch("backend.tasks.score_tasks._upsert_feedback", new=AsyncMock()), \
         patch("backend.tasks.score_tasks._save_to_dataset", return_value=False) as mock_save:

        import backend.tasks.score_tasks as st_mod
        original_router = None
        try:
            from backend.services import llm_router as lr_mod
            original_router = lr_mod.llm_router
            lr_mod.llm_router = mock_router
            # patch the import inside score_tasks
            with patch.object(lr_mod, "llm_router", mock_router):
                result = await _score_async("msg-002", "테스트", "짧아.", "chat")
        finally:
            if original_router is not None:
                lr_mod.llm_router = original_router

    assert result["auto_score"] == pytest.approx(0.3)
    assert result["saved_to_dataset"] is False


# ---------------------------------------------------------------------------
# diary_tasks
# ---------------------------------------------------------------------------

class TestFormatConversation:
    def test_basic(self):
        from backend.tasks.diary_tasks import _format_conversation
        msgs = [
            {"role": "user", "content": "안녕"},
            {"role": "assistant", "content": "안녕하세요!"},
        ]
        result = _format_conversation(msgs)
        assert "주인: 안녕" in result
        assert "나(하나): 안녕하세요!" in result

    def test_truncates_long_content(self):
        from backend.tasks.diary_tasks import _format_conversation
        msgs = [{"role": "user", "content": "x" * 300}]
        result = _format_conversation(msgs)
        # 150자 이하로 잘려야 함
        assert len(result.split(": ", 1)[1]) <= 150


@pytest.mark.asyncio
async def test_write_diary_no_messages(tmp_path):
    """오늘 메시지가 없으면 일기를 쓰지 않는다."""
    from backend.tasks.diary_tasks import _write_diary_async

    with patch("backend.tasks.diary_tasks._fetch_today_messages", return_value=[]):
        result = await _write_diary_async()

    assert result["written"] is False
    assert result["message_count"] == 0


@pytest.mark.asyncio
async def test_write_diary_creates_file(tmp_path):
    """메시지가 있으면 일기 파일이 생성된다."""
    from backend.tasks.diary_tasks import _write_diary_async
    import backend.tasks.diary_tasks as dt_mod

    mock_router = MagicMock()
    mock_router.call_for_text = AsyncMock(return_value="오늘 주인이랑 많이 얘기했다.")

    msgs = [
        {"role": "user", "content": "하나야"},
        {"role": "assistant", "content": "응, 나 여기 있어!"},
    ]

    diary_dir = str(tmp_path / "diary")
    with patch("backend.tasks.diary_tasks._fetch_today_messages", return_value=msgs), \
         patch("backend.tasks.diary_tasks._DIARY_DIR", diary_dir), \
         patch("backend.services.llm_router.llm_router", mock_router):

        # llm_router 내부 import를 패치
        from backend.services import llm_router as lr_mod
        original = lr_mod.llm_router
        lr_mod.llm_router = mock_router
        try:
            result = await _write_diary_async()
        finally:
            lr_mod.llm_router = original

    assert result["written"] is True
    assert result["message_count"] == 2
    assert os.path.exists(result["path"])
    content = open(result["path"], encoding="utf-8").read()
    assert "하나의 일기" in content
    assert "오늘 주인이랑" in content
