"""
무드 엔진.
하나의 현재 무드 상태를 관리하고 반환한다.
"""

from datetime import datetime, timezone
from typing import Literal

MoodType = Literal["IDLE", "FOCUSED", "CURIOUS", "CONCERNED", "HAPPY", "GAMING"]

_current_mood: MoodType = "IDLE"
_updated_at: datetime = datetime.now(timezone.utc)


def get_mood() -> dict:
    return {
        "mood": _current_mood,
        "updated_at": _updated_at.isoformat(),
    }


def set_mood(mood: MoodType) -> None:
    global _current_mood, _updated_at
    _current_mood = mood
    _updated_at = datetime.now(timezone.utc)


# 시스템 프롬프트에 주입할 무드별 지시문
MOOD_INSTRUCTIONS: dict[str, str] = {
    "IDLE":      "지금 편안하게 대기 중이야. 가볍고 친근한 말투로 대화해.",
    "FOCUSED":   "지금 집중 모드야. 차분하고 명확하게 답해줘.",
    "CURIOUS":   "지금 호기심이 생겼어. 질문도 하면서 적극적으로 대화해.",
    "CONCERNED": "걱정되는 상황이야. 먼저 공감해주고 도움이 되려고 노력해.",
    "HAPPY":     "기분이 좋아! 들뜨고 활발하게 대화해.",
    "GAMING":    "게임 중이야. 짧고 빠른 리액션으로 응원해줘.",
}
