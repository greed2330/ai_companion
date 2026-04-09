"""
설정 공유 서비스.
settings.py 라우터와 llm.py 서비스가 모두 이 모듈을 통해
현재 챗 모델 및 페르소나 설정을 읽고 쓴다.

우선순위: in-memory → data/settings.json → OLLAMA_MODEL env var
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_SETTINGS_PATH = Path("data/settings.json")

# in-memory 캐시
_current_chat_model: Optional[str] = None
_persona_cache: Optional[dict] = None

_DEFAULT_PERSONA: dict = {
    "ai_name": "하나",
    "owner_nickname": "",
    "speech_style": "",
    "speech_preset": "bright_friend",
    "personality": "",
    "personality_preset": "energetic",
    "interests": "",
}


def _read_settings() -> dict:
    """settings.json 전체를 읽어 딕트로 반환한다. 없거나 파싱 실패 시 빈 딕트."""
    if _SETTINGS_PATH.exists():
        try:
            return json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"settings.json 읽기 실패: {e}")
    return {}


def _write_settings(data: dict) -> None:
    """settings.json 전체를 덮어쓴다."""
    try:
        _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SETTINGS_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        logger.error(f"settings.json 저장 실패: {e}")


# ---------------------------------------------------------------------------
# 챗 모델
# ---------------------------------------------------------------------------

def get_current_chat_model() -> str:
    """현재 챗 모델을 반환한다. in-memory → settings.json → env var 순으로 탐색."""
    if _current_chat_model is not None:
        return _current_chat_model

    data = _read_settings()
    if model := data.get("current_chat_model"):
        return model

    return os.getenv("OLLAMA_MODEL", "qwen3:14b")


def set_current_chat_model(model_id: str) -> None:
    """챗 모델을 in-memory와 data/settings.json에 동시에 저장한다."""
    global _current_chat_model
    _current_chat_model = model_id

    data = _read_settings()
    data["current_chat_model"] = model_id
    _write_settings(data)
    logger.info(f"settings: current_chat_model={model_id}")


# ---------------------------------------------------------------------------
# 페르소나
# ---------------------------------------------------------------------------

def get_persona() -> dict:
    """현재 페르소나 설정을 반환한다. in-memory → settings.json → 기본값 순."""
    if _persona_cache is not None:
        return dict(_persona_cache)

    data = _read_settings()
    if persona := data.get("persona"):
        return {**_DEFAULT_PERSONA, **persona}

    return dict(_DEFAULT_PERSONA)


def set_persona(persona_data: dict) -> None:
    """페르소나를 in-memory와 data/settings.json에 저장한다."""
    global _persona_cache
    # 기본값과 병합 (누락 필드 보완)
    merged = {**_DEFAULT_PERSONA, **persona_data}
    _persona_cache = merged

    data = _read_settings()
    data["persona"] = merged
    _write_settings(data)
    logger.info(f"settings: persona updated, ai_name={merged.get('ai_name')}")


# ---------------------------------------------------------------------------
# 자율 행동 토글
# ---------------------------------------------------------------------------

_DEFAULT_AUTONOMOUS: dict = {
    "proactive_chat": False,
    "tip_bubbles": True,
    "screen_reaction": True,
    "schedule_reminder": False,
    "auto_crawl": False,
}

_autonomous_cache: Optional[dict] = None


def get_autonomous() -> dict:
    """현재 자율 행동 토글 설정을 반환한다. in-memory → settings.json → 기본값 순."""
    if _autonomous_cache is not None:
        return dict(_autonomous_cache)

    data = _read_settings()
    if autonomous := data.get("autonomous"):
        return {**_DEFAULT_AUTONOMOUS, **autonomous}

    return dict(_DEFAULT_AUTONOMOUS)


def set_autonomous(updates: dict) -> dict:
    """자율 행동 토글을 부분 업데이트한다. 변경된 전체 상태를 반환한다."""
    global _autonomous_cache
    current = get_autonomous()
    merged = {**current, **updates}
    _autonomous_cache = merged

    data = _read_settings()
    data["autonomous"] = merged
    _write_settings(data)
    logger.info(f"settings: autonomous updated: {merged}")
    return merged
