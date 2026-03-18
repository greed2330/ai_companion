"""
설정 공유 서비스.
settings.py 라우터와 llm.py 서비스가 모두 이 모듈을 통해
현재 챗 모델을 읽고 쓴다.

우선순위: in-memory → data/settings.json → OLLAMA_MODEL env var
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_SETTINGS_PATH = Path("data/settings.json")

# in-memory 캐시. None이면 settings.json 또는 env var로 fallback.
_current_chat_model: str | None = None


def get_current_chat_model() -> str:
    """현재 챗 모델을 반환한다. in-memory → settings.json → env var 순으로 탐색."""
    if _current_chat_model is not None:
        return _current_chat_model

    if _SETTINGS_PATH.exists():
        try:
            data = json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
            if model := data.get("current_chat_model"):
                return model
        except Exception as e:
            logger.warning(f"settings.json 읽기 실패, env var로 fallback: {e}")

    return os.getenv("OLLAMA_MODEL", "qwen3:14b")


def set_current_chat_model(model_id: str) -> None:
    """챗 모델을 in-memory와 data/settings.json에 동시에 저장한다."""
    global _current_chat_model
    _current_chat_model = model_id

    try:
        _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SETTINGS_PATH.write_text(
            json.dumps({"current_chat_model": model_id}, ensure_ascii=False),
            encoding="utf-8",
        )
        logger.info(f"settings.json 저장: current_chat_model={model_id}")
    except Exception as e:
        logger.error(f"settings.json 저장 실패: {e}")
