"""
세션 시작 컨텍스트 판단.

규칙: 과거 기억 = 가설. 오늘 첫 신호 = 검증. 미검증 과거 상태에 반응 금지.
"""

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

_STATE_FILE = "data/last_session.json"

POSITIVE_SIGNALS = ["ㅋㅋ", "ㅎㅎ", "!", "좋아", "됐다", "해결", "대박"]
NEGATIVE_SIGNALS = ["힘들", "모르겠", "어떡", "ㅠ", "ㅜ", "...", "지쳐"]


@dataclass
class SessionContext:
    past_weight: float
    current_state: str        # "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "UNKNOWN"
    approach: str
    system_hint: str
    proactive_msg: Optional[str] = None


def _calc_past_weight(hours: float) -> float:
    if hours >= 24:
        return 0.02
    if hours >= 8:
        return 0.05
    if hours >= 3:
        return 0.25
    if hours >= 1:
        return 0.50
    return 0.80


def _estimate_state(msg: Optional[str], energy: Optional[float]) -> str:
    if msg is None:
        return "UNKNOWN"
    if energy is not None:
        if energy >= 0.7:
            return "POSITIVE"
        if energy <= 0.3:
            return "NEGATIVE"
    pos = sum(1 for k in POSITIVE_SIGNALS if k in msg)
    neg = sum(1 for k in NEGATIVE_SIGNALS if k in msg)
    if pos > neg:
        return "POSITIVE"
    if neg > pos:
        return "NEGATIVE"
    return "NEUTRAL"


def _decide(
    current: str, last_emotion: Optional[str], weight: float
) -> tuple[str, str, Optional[str]]:
    if current == "POSITIVE":
        return (
            "FRESH_START",
            "Owner arrived in positive mood. Never mention past distress unless owner brings it up first.",
            None,
        )
    if current == "UNKNOWN":
        if weight < 0.1:
            return ("FRESH_GREET", "New session. No past context. Light greeting only.", "왔어?")
        if last_emotion in ("DISTRESSED", "NEGATIVE"):
            return (
                "OBSERVE_FIRST",
                "Owner arrived. State unknown. Greet lightly. No past references. Read response first.",
                "왔어?",
            )
        return ("NEUTRAL_GREET", "Greet normally.", None)
    if (
        current == "NEGATIVE"
        and last_emotion in ("DISTRESSED", "NEGATIVE")
        and weight >= 0.4
    ):
        return (
            "GENTLE_CHECK",
            "Owner seems down. Do NOT say things like '왜 한숨 쉬어?'. "
            "Ask naturally how they are. Drop it if they say they're fine.",
            None,
        )
    if current == "NEGATIVE" and weight < 0.4:
        return (
            "OPEN_QUESTION",
            "Owner seems down but past context is stale. Ask openly what's up today.",
            None,
        )
    return ("NEUTRAL_GREET", "Converse normally.", None)


def save_session_end(emotion: str, context_summary: str) -> None:
    """세션 종료 상태를 파일에 저장한다."""
    os.makedirs("data", exist_ok=True)
    try:
        with open(_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "ended_at": time.time(),
                    "last_emotion": emotion,
                    "last_context": context_summary,
                },
                f,
            )
    except Exception as e:
        logger.warning("save_session_end 실패: %s", e)


def judge_session_start(
    first_message: Optional[str] = None,
    audio_energy: Optional[float] = None,
) -> SessionContext:
    """
    첫 번째 메시지와 음성 에너지를 보고 세션 접근 방식을 결정한다.
    이전 세션 상태는 가설로만 사용한다.
    """
    last_emotion: Optional[str] = None
    last_context = ""
    hours = 999.0

    try:
        with open(_STATE_FILE, encoding="utf-8") as f:
            s = json.load(f)
        hours = (time.time() - s.get("ended_at", 0)) / 3600
        last_emotion = s.get("last_emotion")
        last_context = s.get("last_context", "")
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    weight = _calc_past_weight(hours)
    current = _estimate_state(first_message, audio_energy)
    approach, hint, proactive = _decide(current, last_emotion, weight)

    if weight >= 0.4 and last_context:
        hint += f"\nReference (confidence {int(weight * 100)}%): {last_context}"

    logger.debug(
        "judge_session_start: hours=%.1f weight=%.2f current=%s approach=%s",
        hours,
        weight,
        current,
        approach,
    )
    return SessionContext(
        past_weight=weight,
        current_state=current,
        approach=approach,
        system_hint=hint,
        proactive_msg=proactive,
    )
