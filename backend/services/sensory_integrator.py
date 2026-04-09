"""
멀티모달 감각 통합 서비스.

우선순위: audio mismatch > visual > text
감각 채널들을 통합해 하나가 "느끼는" IntegratedRead를 생성한다.
AI 호출 없음 — 규칙 기반 처리.
"""

from __future__ import annotations

import logging
from typing import Optional

from backend.models.experience import IntegratedRead, SensoryData

logger = logging.getLogger(__name__)

# 텍스트에서 부정적 감정 키워드 (간단 규칙)
_NEGATIVE_KEYWORDS = {
    "슬퍼", "힘들", "짜증", "화나", "외로", "우울", "답답", "모르겠", "싫", "지쳐",
    "못하겠", "포기", "사라지", "죽고 싶", "죽겠", "망했", "최악", "괴로",
}
_POSITIVE_KEYWORDS = {
    "좋아", "행복", "기뻐", "신나", "고마워", "감사", "설레", "재밌", "잘됐",
    "성공", "최고", "완벽", "이겼", "해냈", "헤헤", "ㅋㅋ", "ㅎㅎ",
}
_CURIOUS_KEYWORDS = {
    "왜", "어떻게", "뭐야", "진짜", "정말", "혹시", "궁금", "어때",
}


def integrate(
    sensory: SensoryData,
    owner_emotion: str = "NEUTRAL",
) -> IntegratedRead:
    """
    SensoryData를 통합해 IntegratedRead를 반환한다.

    Parameters
    ----------
    sensory       : 원본 감각 입력
    owner_emotion : 이미 추정된 오너 감정 (텍스트 분석 결과)
    """
    text = sensory.text or ""
    audio = sensory.audio_features or {}
    visual = sensory.visual_context

    channel = "text"
    emotional_tone = _infer_text_emotion(text, owner_emotion)
    energy = _infer_energy(text, audio)
    context_notes: list[str] = []
    has_mismatch = False

    # 오디오 채널 처리
    if audio:
        audio_energy = float(audio.get("energy", 0.5))
        audio_emotion = _infer_audio_emotion(audio)

        # 텍스트-오디오 감정 불일치 감지
        if _is_mismatch(emotional_tone, audio_emotion):
            has_mismatch = True
            channel = "audio"  # 불일치 시 오디오 우선
            emotional_tone = audio_emotion
            context_notes.append(
                f"Audio mismatch: text={emotional_tone} audio={audio_emotion}"
            )
        else:
            # 일치하면 오디오 에너지를 에너지 레벨에 반영
            energy = (energy + audio_energy) / 2

        if audio.get("rising_tone"):
            context_notes.append("Rising tone detected (questioning or excitement)")

    # 비주얼 채널 처리 (오디오 mismatch 없을 때만 우선)
    if visual and not has_mismatch:
        channel = "visual"
        context_notes.append(f"Screen: {visual[:100]}")

    # 텍스트 의도 추출 (간단 분류)
    text_intent = _classify_intent(text)

    logger.debug(
        "Sensory integrated: channel=%s emotion=%s energy=%.2f mismatch=%s",
        channel, emotional_tone, energy, has_mismatch,
    )

    return IntegratedRead(
        dominant_channel=channel,
        text_intent=text_intent,
        emotional_tone=emotional_tone,
        energy_level=max(0.0, min(1.0, energy)),
        has_audio_mismatch=has_mismatch,
        context_notes=context_notes,
    )


def _infer_text_emotion(text: str, owner_emotion: str) -> str:
    """텍스트 내용과 이미 추정된 오너 감정에서 감정 톤을 결정한다."""
    if owner_emotion and owner_emotion not in ("NEUTRAL", ""):
        return owner_emotion

    lower = text.lower()
    if any(kw in lower for kw in _NEGATIVE_KEYWORDS):
        return "SAD"
    if any(kw in lower for kw in _POSITIVE_KEYWORDS):
        return "HAPPY"
    if any(kw in lower for kw in _CURIOUS_KEYWORDS):
        return "CURIOUS"
    return "NEUTRAL"


def _infer_audio_emotion(audio: dict) -> str:
    """오디오 특성에서 감정을 추정한다."""
    energy = float(audio.get("energy", 0.5))
    rising = bool(audio.get("rising_tone", False))
    sad_markers = bool(audio.get("slow_pace", False)) or energy < 0.3

    if sad_markers:
        return "SAD"
    if rising and energy > 0.7:
        return "HAPPY"
    if rising:
        return "CURIOUS"
    if energy > 0.85:
        return "EXCITED"
    return "NEUTRAL"


def _infer_energy(text: str, audio: dict) -> float:
    """에너지 레벨을 추정한다."""
    base = 0.5
    if audio:
        return float(audio.get("energy", base))
    # 텍스트 길이와 간투사 기반 에너지 추정
    if len(text) > 100:
        base += 0.1
    if "!" in text:
        base += 0.1
    if "ㅋㅋ" in text or "ㅎㅎ" in text:
        base += 0.15
    if "..." in text or "ㅠ" in text:
        base -= 0.15
    return max(0.0, min(1.0, base))


def _classify_intent(text: str) -> str:
    """텍스트 의도를 간단히 분류한다."""
    lower = text.lower()
    if "?" in text or any(kw in lower for kw in ("왜", "어떻게", "뭐야", "알려줘", "설명")):
        return "question"
    if any(kw in lower for kw in ("해줘", "부탁", "도와줘", "할 수 있어", "해줄 수")):
        return "request"
    if any(kw in lower for kw in ("느껴", "같아", "생각해", "힘들", "슬퍼", "기뻐")):
        return "emotional_share"
    return "statement"


def _is_mismatch(text_emotion: str, audio_emotion: str) -> bool:
    """텍스트와 오디오 감정이 불일치하는지 판단한다."""
    if text_emotion == audio_emotion:
        return False
    # NEUTRAL은 불일치로 보지 않음
    if "NEUTRAL" in (text_emotion, audio_emotion):
        return False
    # 반대 감정 쌍 정의
    opposite_pairs = {("HAPPY", "SAD"), ("EXCITED", "SAD"), ("HAPPY", "CURIOUS")}
    pair = (text_emotion, audio_emotion)
    reverse = (audio_emotion, text_emotion)
    return pair in opposite_pairs or reverse in opposite_pairs
