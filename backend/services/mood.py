"""
무드 엔진.
하나의 현재 무드 상태를 관리하고, 변경 시 SSE 구독자에게 push한다.
"""

import asyncio
from datetime import datetime, timezone
from typing import Literal

MoodType = Literal["IDLE", "FOCUSED", "CURIOUS", "CONCERNED", "HAPPY", "GAMING"]

_current_mood: MoodType = "IDLE"
_updated_at: datetime = datetime.now(timezone.utc)

# SSE 구독자 큐 목록 — 연결된 클라이언트마다 하나씩
_subscribers: list[asyncio.Queue] = []

# 텍스트 키워드 → 무드 자동 감지 규칙
MOOD_TRIGGERS: dict[MoodType, list[str]] = {
    "HAPPY":     ["ㅋㅋ", "좋아", "신나", "완료", "해결", "성공", "이겼", "고마워", "최고"],
    "CONCERNED": ["에러", "오류", "error", "Error", "실패", "문제", "버그", "안 돼", "모르겠"],
    "FOCUSED":   ["코딩", "작업", "구현", "개발", "디버깅", "함수", "클래스", "리팩토링"],
    "CURIOUS":   ["왜", "어떻게", "뭐야", "궁금", "모르", "무슨"],
    "GAMING":    ["게임", "마인크래프트", "롤", "플레이", "레이드", "스테이지"],
}

# 시스템 프롬프트에 주입할 무드별 지시문
MOOD_INSTRUCTIONS: dict[str, str] = {
    "IDLE":      "지금 편안하게 대기 중이야. 가볍고 친근한 말투로 대화해.",
    "FOCUSED":   "지금 집중 모드야. 차분하고 명확하게 답해줘.",
    "CURIOUS":   "지금 호기심이 생겼어. 질문도 하면서 적극적으로 대화해.",
    "CONCERNED": "걱정되는 상황이야. 먼저 공감해주고 도움이 되려고 노력해.",
    "HAPPY":     "기분이 좋아! 들뜨고 활발하게 대화해.",
    "GAMING":    "게임 중이야. 짧고 빠른 리액션으로 응원해줘.",
}


def get_mood() -> dict:
    return {
        "mood": _current_mood,
        "updated_at": _updated_at.isoformat(),
    }


def set_mood(mood: MoodType) -> None:
    """무드를 변경하고 모든 SSE 구독자에게 push한다."""
    global _current_mood, _updated_at
    _current_mood = mood
    _updated_at = datetime.now(timezone.utc)

    event = {"type": "mood_change", "mood": mood, "updated_at": _updated_at.isoformat()}
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass  # 느린 클라이언트는 건너뜀


def subscribe() -> asyncio.Queue:
    """새 SSE 클라이언트 큐를 등록하고 반환한다."""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    """SSE 클라이언트 연결 해제 시 큐를 제거한다."""
    try:
        _subscribers.remove(q)
    except ValueError:
        pass


def push_event(event: dict) -> None:
    """임의 이벤트를 모든 SSE 구독자에게 push한다."""
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass  # 느린 클라이언트는 건너뜀


def detect_mood_from_text(text: str) -> MoodType:
    """텍스트에서 키워드를 감지해 적합한 무드를 반환한다.
    매칭되는 키워드가 없으면 현재 무드를 유지하기 위해 None 반환이 아닌 IDLE 반환.
    """
    for mood, keywords in MOOD_TRIGGERS.items():
        for keyword in keywords:
            if keyword in text:
                return mood
    return "IDLE"
