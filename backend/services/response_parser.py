"""
응답 파서.
LLM 텍스트 또는 protocol dict에서 감정/주제/액션을 규칙 기반으로 추출한다.
AI 호출 없음.
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

EMOTION_KEYWORDS: dict[str, list[str]] = {
    "HAPPY":        ["기뻐", "좋아", "신나", "ㅋㅋ", "ㅎㅎ", "!"],
    "CONCERNED":    ["걱정", "힘들", "괜찮아?", "많이", "쉬어"],
    "EXCITED":      ["진짜?!", "대박", "오", "와"],
    "CURIOUS":      ["왜", "어떻게", "그래?", "진짜"],
    "SULKY":        ["...응", "그래", "알았어", "됐어"],
    "AFFECTIONATE": ["ㅠ", "고마워", "다행", "같이"],
}

TOPIC_KEYWORDS: dict[str, list[str]] = {
    "coding": ["코드", "버그", "에러", "함수", "git", "python", "js"],
    "game":   ["게임", "롤", "마인크래프트", "스팀", "플레이"],
}

ACTION_KEYWORDS: dict[str, list[str]] = {
    "proactive_comfort": ["많이", "힘들었", "괜찮아?", "걱정"],
    "suggest_break":     ["쉬어", "잠깐", "눈 감"],
    "ask":               ["?", "뭐야", "어때"],
}

OWNER_NEG: list[str] = ["힘들", "피곤", "지쳐", "슬퍼", "모르겠다"]
OWNER_POS: list[str] = ["좋아", "신나", "재밌", "행복", "됐다"]


def _detect(text: str, mapping: dict[str, list[str]]) -> tuple[str, float]:
    """키워드 빈도로 가장 적합한 레이블과 강도를 반환한다."""
    scores = {
        k: sum(1 for w in ws if w in text)
        for k, ws in mapping.items()
    }
    scores = {k: v for k, v in scores.items() if v > 0}
    if not scores:
        return "IDLE", 0.5
    best = max(scores, key=lambda k: scores[k])
    return best, min(1.0, scores[best] * 0.3)


@dataclass
class ParsedResponse:
    text: str
    emotion: str          # HAPPY | CONCERNED | EXCITED | CURIOUS | SULKY | AFFECTIONATE | IDLE
    intensity: float      # 0.0 ~ 1.0
    topic: str            # "coding" | "game" | "general"
    owner_emotion: str    # "DISTRESSED" | "HAPPY" | "NEUTRAL"
    action: str           # "none" | "proactive_comfort" | "ask" | "suggest_break"


async def parse_response(
    raw: "str | dict",
    original_message: str,
) -> ParsedResponse:
    """
    raw가 dict이면 protocol 응답으로 간주해 emotion/intensity를 직접 읽는다.
    str이면 규칙 기반으로 감정을 감지한다.
    """
    if isinstance(raw, dict):
        emotion = raw.get("emotion", "IDLE")
        intensity = float(raw.get("intensity", 0.5))
        text = raw.get("response", "")
    else:
        text = raw
        emotion, intensity = _detect(text, EMOTION_KEYWORDS)

    topic = next(
        (t for t, kws in TOPIC_KEYWORDS.items() if any(k in original_message for k in kws)),
        "general",
    )
    action, _ = _detect(text, ACTION_KEYWORDS)
    if action == "IDLE":
        action = "none"

    owner_emotion = (
        "DISTRESSED" if any(k in original_message for k in OWNER_NEG)
        else "HAPPY" if any(k in original_message for k in OWNER_POS)
        else "NEUTRAL"
    )

    logger.debug(
        "parse_response: emotion=%s intensity=%.2f topic=%s action=%s owner_emotion=%s",
        emotion, intensity, topic, action, owner_emotion,
    )
    return ParsedResponse(
        text=text,
        emotion=emotion,
        intensity=intensity,
        topic=topic,
        owner_emotion=owner_emotion,
        action=action,
    )
