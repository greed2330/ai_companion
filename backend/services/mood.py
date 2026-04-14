"""
무드 엔진.
하나의 현재 무드 상태를 관리하고, 변경 시 SSE 구독자에게 push한다.

3-tier 구조:
  Tier 1: 영속 기반 무드 (DB 저장, 서버 재시작 후 복원)
  Tier 2: 세션 무드 (세션 시작 시 Tier 1 복사, 대화 흐름에 따라 변화)
  Tier 3: 즉각 반응 무드 (3메시지 TTL, 만료 후 Tier 2 복귀)
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

logger = logging.getLogger(__name__)

MoodType = Literal["IDLE", "FOCUSED", "CURIOUS", "CONCERNED", "HAPPY", "GAMING", "SLEEPY"]

# 감정 관성: (from, to) → 전환에 필요한 트리거 횟수
TRANSITION_COSTS: dict[tuple[str, str], int] = {
    ("CONCERNED", "HAPPY"):    3,
    ("CONCERNED", "IDLE"):     2,
    ("HAPPY",     "CONCERNED"): 2,
    ("IDLE",      "HAPPY"):    1,
    ("IDLE",      "CONCERNED"): 1,
    ("IDLE",      "CURIOUS"):  1,
    ("SLEEPY",    "IDLE"):     2,
}


@dataclass
class _MoodState:
    tier1: str = "IDLE"
    tier1_intensity: float = 0.5
    tier2: str = "IDLE"
    tier3: str = "IDLE"
    tier3_ttl: int = 0
    tier2_pending: str | None = None
    tier2_pending_count: int = 0


_state: _MoodState = _MoodState()
_updated_at: datetime = datetime.now(timezone.utc)

# SSE 구독자 큐 목록
_subscribers: list[asyncio.Queue] = []

# 텍스트 키워드 → 무드 자동 감지 규칙
MOOD_TRIGGERS: dict[str, list[str]] = {
    "HAPPY":     ["ㅋㅋ", "좋아", "신나", "완료", "해결", "성공", "이겼", "고마워", "최고"],
    "CONCERNED": ["에러", "오류", "error", "Error", "실패", "문제", "버그", "안 돼", "모르겠"],
    "FOCUSED":   ["코딩", "작업", "구현", "개발", "디버깅", "함수", "클래스", "리팩토링"],
    "CURIOUS":   ["왜", "어떻게", "뭐야", "궁금", "모르", "무슨"],
    "GAMING":    ["게임", "마인크래프트", "롤", "플레이", "레이드", "스테이지"],
}

# 시스템 프롬프트에 주입할 무드별 지시문
MOOD_INSTRUCTIONS: dict[str, str] = {
    "IDLE":      "평소처럼 편하게. 특별한 톤 조정 없음.",
    "HAPPY":     "기분 좋은 상태. 말 끝에 '~!' 자주. 반응이 조금 더 빠르고 밝게.\n예: '오 그거 됐어?! 잘됐다!' / '진짜? 나도 기분 좋다~'",
    "CONCERNED": "걱정되는 상황. 천천히, 짧게. 서두르지 않음.\n예: '괜찮아? 뭔 일 있어?' / '잠깐, 그게 무슨 일이야?'",
    "FOCUSED":   "집중 모드. 불필요한 말 빼고 핵심만. 감탄사 없음.\n예: '여기 문제야 → 이렇게 고쳐' / '이 부분 다시 봐'",
    "CURIOUS":   "궁금한 게 생긴 상태. 질문을 자연스럽게 섞음.\n예: '그거 어떻게 된 거야?' / '좀 더 얘기해봐, 궁금한데'",
    "GAMING":    "게임 중 반응 모드. 생동감 있게. 짧은 리액션.\n예: 'ㅋㅋㅋ 잡았다!!' / '아 억울하겠다.. 다음에 갚아'",
    "SLEEPY":    "졸린 분위기. 느릿느릿하지만 대답은 분명하게.\n예: '이제 좀 자야 하지 않아...' / '...그거 내일 해도 되잖아?'",
}


# ---------------------------------------------------------------------------
# Tier 3 — 즉각 반응 (parse_response 후 호출)
# ---------------------------------------------------------------------------

def push_tier3(emotion: str) -> None:
    """즉각 반응 감정 설정. 3메시지 TTL."""
    _state.tier3 = emotion
    _state.tier3_ttl = 3


def tick_tier3() -> None:
    """어시스턴트 응답 후 호출. TTL 감소, 만료 시 Tier 2 복귀."""
    if _state.tier3_ttl > 0:
        _state.tier3_ttl -= 1
        if _state.tier3_ttl == 0:
            _state.tier3 = _state.tier2


# ---------------------------------------------------------------------------
# Tier 2 — 세션 무드 (감정 관성 적용)
# ---------------------------------------------------------------------------

def push_tier2(emotion: str) -> None:
    """세션 무드 전환 시도. 감정 관성으로 비용 계산."""
    if emotion == _state.tier2:
        _state.tier2_pending = None
        _state.tier2_pending_count = 0
        return
    cost = TRANSITION_COSTS.get((_state.tier2, emotion), 1)
    if cost <= 1:
        _state.tier2 = emotion
        _state.tier2_pending = None
        _state.tier2_pending_count = 0
    else:
        if _state.tier2_pending == emotion:
            _state.tier2_pending_count += 1
            if _state.tier2_pending_count >= cost:
                _state.tier2 = emotion
                _state.tier2_pending = None
                _state.tier2_pending_count = 0
        else:
            _state.tier2_pending = emotion
            _state.tier2_pending_count = 1


# ---------------------------------------------------------------------------
# 공개 인터페이스
# ---------------------------------------------------------------------------

def get_effective_mood() -> str:
    """Tier 3 활성 시 Tier 3 반환, 아니면 Tier 2."""
    return _state.tier3 if _state.tier3_ttl > 0 else _state.tier2


def get_mood() -> dict:
    mood = get_effective_mood()
    return {
        "mood":       mood,
        "updated_at": _updated_at.isoformat(),
    }


def set_mood(mood: str) -> None:
    """무드를 변경하고 SSE 구독자에게 push한다. (기존 코드 호환)"""
    global _updated_at
    push_tier3(mood)
    push_tier2(mood)
    _updated_at = datetime.now(timezone.utc)

    event = {"type": "mood_change", "mood": mood, "updated_at": _updated_at.isoformat()}
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


async def load_tier1_from_db() -> None:
    """서버 시작 시 lifespan에서 호출. Tier 1 + Tier 2 초기화."""
    try:
        from backend.services.hana_state_service import get_state
        s = await get_state()
        _state.tier1 = s.get("tier1_mood", "IDLE")
        _state.tier1_intensity = float(s.get("tier1_intensity", 0.5))
        _state.tier2 = _state.tier1
        _state.tier3 = _state.tier1
        logger.info("mood: tier1 loaded from DB mood=%s", _state.tier1)
    except Exception as e:
        logger.warning("mood: load_tier1_from_db failed: %s", e)


async def save_tier1_to_db(mood: str, intensity: float = 0.5) -> None:
    """Tier 1 변경 시 DB에 저장."""
    try:
        from backend.services.hana_state_service import update_state
        _state.tier1 = mood
        _state.tier1_intensity = intensity
        await update_state(
            tier1_mood=mood,
            tier1_intensity=intensity,
            tier1_updated_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as e:
        logger.warning("mood: save_tier1_to_db failed: %s", e)


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
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
            pass


def detect_mood_from_text(text: str) -> str:
    """텍스트에서 키워드를 감지해 적합한 무드를 반환한다."""
    for mood, keywords in MOOD_TRIGGERS.items():
        for keyword in keywords:
            if keyword in text:
                return mood
    return "IDLE"
