"""
리액션 엔진 — 3단계 필터.

Tier 1 (물리, 항상): 깜빡임, 호흡, 시선 추적 (cost=0)
Tier 2 (규칙, cost=0): 쿨다운 / 포화도 / 집중 체크
Tier 3 (생성, 필요할 때만):
  LOW    → 템플릿 (cost=0)
  MEDIUM → qwen3:4b worker
  HIGH   → main LLM
"""

import logging
import random
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# 이벤트별 최소 재발화 간격 (초)
_MIN_INTERVAL: dict[str, int] = {
    "chat_message":    0,
    "error_detected":  10,
    "afk_return":      0,
    "ocr_change":      30,
    "mood_change":     60,
    "idle_comment":    1800,
    "time_check":      3600,
}

# 즉시 반응 이벤트 (쿨다운 무시)
_IMMEDIATE: frozenset[str] = frozenset({
    "owner_called_name",
    "danger_detected",
    "owner_distress_high",
    "afk_return",
})

# 낮은 우선순위 이벤트 (집중 모드 시 건너뜀)
_LOW_PRIORITY: frozenset[str] = frozenset({
    "idle_comment",
    "time_check",
    "music_detected",
    "weather_change",
})

# 이벤트 우선순위 점수 (0.0 ~ 1.0)
EVENT_PRIORITY: dict[str, float] = {
    "chat_message":    1.0,
    "owner_distress":  0.9,
    "error_detected":  0.8,
    "afk_return":      0.85,
    "game_event":      0.6,
    "ocr_change":      0.3,
    "mood_change":     0.5,
    "idle_comment":    0.2,
    "time_check":      0.15,
}

# 템플릿 모션 시퀀스 (cost=0)
_TEMPLATES: dict[str, list[dict]] = {
    "ocr_change": [
        {
            "motion_sequence": [
                {"abstract": "head_x",  "value": 5,   "duration": 300, "easing": "ease_out"},
                {"abstract": "gaze_x",  "value": 0.2, "duration": 200},
            ]
        },
    ],
    "mouse_near": [
        {
            "motion_sequence": [
                {"abstract": "eye_open", "value": 1.1, "duration": 200},
            ]
        },
    ],
    "mood_change": [
        {
            "motion_sequence": [
                {"abstract": "head_z", "value": 5, "duration": 400, "easing": "ease_in_out"},
            ]
        },
    ],
}


@dataclass
class ReactionDecision:
    should_react: bool
    intensity: str       # "NONE" | "LOW" | "MEDIUM" | "HIGH"
    strategy: str        # "skip" | "template" | "worker" | "full"
    template_key: Optional[str] = None


class ReactionEngine:
    def __init__(self):
        self._last_reaction: dict[str, float] = {}
        self._recent: list[float] = []

    def judge(
        self,
        event_type: str,
        event_priority: float,
        owner_state: str = "IDLE",
    ) -> ReactionDecision:
        """이벤트를 분석해 반응 여부와 전략을 결정한다."""
        if event_type in _IMMEDIATE:
            return ReactionDecision(True, "HIGH", "full")

        now = time.time()
        elapsed = now - self._last_reaction.get(event_type, 0)
        if elapsed < _MIN_INTERVAL.get(event_type, 120):
            return ReactionDecision(False, "NONE", "skip")

        if owner_state == "FOCUSED" and event_type in _LOW_PRIORITY:
            return ReactionDecision(False, "NONE", "skip")

        # 5분 내 최근 반응 4회 이상 + 낮은 우선순위 → 스킵 (포화도)
        self._recent = [t for t in self._recent if now - t < 300]
        if len(self._recent) >= 4 and event_priority < 0.7:
            return ReactionDecision(False, "NONE", "skip")

        score = min(1.0, event_priority + min(0.3, elapsed / 7200))
        if score >= 0.8:
            intensity, strategy = "HIGH",   "full"
        elif score >= 0.5:
            intensity, strategy = "MEDIUM", "worker"
        else:
            intensity, strategy = "LOW",    "template"

        self._last_reaction[event_type] = now
        self._recent.append(now)

        logger.debug(
            "reaction_engine: event=%s score=%.2f intensity=%s strategy=%s",
            event_type, score, intensity, strategy,
        )
        return ReactionDecision(
            True, intensity, strategy,
            template_key=event_type if strategy == "template" else None,
        )

    def get_template(self, key: str) -> dict:
        """템플릿 모션 시퀀스를 무작위로 반환한다."""
        options = _TEMPLATES.get(key, [])
        return random.choice(options) if options else {"motion_sequence": []}


# 모듈 싱글톤
reaction_engine = ReactionEngine()
