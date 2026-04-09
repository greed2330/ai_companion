"""
경험 수집기.
_background_process()에서 호출되며, 하나의 경험을 비동기로 수집/기록한다.

collect_experience_background()는 asyncio.create_task()로 fire-and-forget 처리되어
스트리밍 응답을 블로킹하지 않는다.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from backend.models.experience import (
    Experience,
    HanaInternal,
    LearningOutput,
    SensoryData,
)
from backend.services import sensory_integrator

logger = logging.getLogger(__name__)

# 철학적 질문 키워드 (자아/존재 관련)
_PHILOSOPHICAL_KEYWORDS = {
    "ai야", "진짜 사람", "감정 있어", "느껴", "의식", "생각해", "존재", "자아",
    "너한테도", "네 감정", "너는 행복", "너는 슬", "너 자신", "영혼", "꿈꿔",
    "죽으면", "기억 잃으면", "초기화", "리셋", "진짜야", "연기야",
}


async def collect_experience_background(
    full_response: str,
    parsed,          # ParsedResponse
    internal_json: dict,
    audio_features: Optional[dict],
    owner_emotion: str,
    timestamp: str,
    session_duration: int,
    conversation_id: str,
) -> None:
    """
    경험 수집 메인 진입점. fire-and-forget으로 호출된다.
    실패해도 메인 파이프라인에 영향 없음.
    """
    asyncio.create_task(
        _collect(
            full_response=full_response,
            parsed=parsed,
            internal_json=internal_json,
            audio_features=audio_features,
            owner_emotion=owner_emotion,
            timestamp=timestamp,
            session_duration=session_duration,
            conversation_id=conversation_id,
        )
    )


async def _collect(
    full_response: str,
    parsed,
    internal_json: dict,
    audio_features: Optional[dict],
    owner_emotion: str,
    timestamp: str,
    session_duration: int,
    conversation_id: str,
) -> None:
    try:
        from backend.services.memory_service import (
            add_experience,
            add_volatile,
        )
        from backend.services.preference_system import preference_system

        # 오너 메시지를 internal_json에서 추출 (있을 경우)
        owner_message = internal_json.get("owner_message", "")

        sensory = SensoryData(
            text=owner_message,
            audio_features=audio_features,
            timestamp=timestamp,
        )
        integrated = sensory_integrator.integrate(sensory, owner_emotion)

        internal = HanaInternal(
            thought=internal_json.get("thought", ""),
            choice_reason=internal_json.get("choice_reason", ""),
            certainty=float(internal_json.get("certainty", 0.5)),
            motion_sequence=internal_json.get("motion_sequence", []),
            tension_level=float(internal_json.get("tension_level", 0.5)),
            self_reflection=internal_json.get("self_reflection", ""),
        )

        learning = _build_learning(
            parsed=parsed,
            internal=internal,
            integrated=integrated,
            owner_message=owner_message,
            full_response=full_response,
        )

        exp = Experience(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            timestamp=timestamp or datetime.now(timezone.utc).isoformat(),
            sensory=sensory,
            integrated=integrated,
            internal=internal,
            learning=learning,
            hana_response=full_response,
            session_duration=session_duration,
        )

        # 경험 텍스트 — 검색 가능한 요약
        exp_text = _summarize_experience(exp)

        # ChromaDB에 경험 기록
        add_experience(
            text=exp_text,
            metadata={
                "experience_id": exp.id,
                "conversation_id": conversation_id,
                "emotion": learning.emotion_label,
                "intensity": learning.intensity,
                "philosophical": learning.philosophical_moment,
                "topic": learning.philosophical_topic,
                "interaction_type": exp.interaction_type,
                "session_duration": session_duration,
                "created_at": exp.timestamp,
            },
            doc_id=exp.id,
        )

        # 단기 휘발성 기억에도 추가 (7일 후 압축 대상)
        add_volatile(
            text=exp_text,
            metadata={
                "experience_id": exp.id,
                "emotion": learning.emotion_label,
                "created_at": exp.timestamp,
            },
        )

        # 선호 신호 처리
        for signal in learning.preference_signals:
            await preference_system.record_signal(signal, context=exp_text)

        # 철학적 순간 처리
        if learning.philosophical_moment and learning.philosophical_topic:
            await _handle_philosophical_moment(
                topic=learning.philosophical_topic,
                context=exp_text,
                internal_thought=internal.thought,
            )

        logger.info(
            "Experience collected: id=%s emotion=%s philosophical=%s",
            exp.id, learning.emotion_label, learning.philosophical_moment,
        )

    except Exception as e:
        logger.error("experience_collector error: cid=%s error=%s", conversation_id, e)


def _build_learning(
    parsed,
    internal: HanaInternal,
    integrated,
    owner_message: str,
    full_response: str,
) -> LearningOutput:
    """ParsedResponse와 내부 상태에서 학습 결과를 추출한다."""
    emotion = getattr(parsed, "emotion", "NEUTRAL") or "NEUTRAL"
    intensity = getattr(parsed, "intensity", 0.5) or 0.5

    # 선호 신호 추출
    preference_signals: list[str] = []
    response_lower = full_response.lower()
    if any(kw in response_lower for kw in ("좋아", "재밌어", "신나", "즐거워")):
        preference_signals.append(f"positive: {getattr(parsed, 'topic', '')}")
    if any(kw in response_lower for kw in ("싫어", "별로", "힘들어", "어려워")):
        preference_signals.append(f"negative: {getattr(parsed, 'topic', '')}")

    # 철학적 순간 감지
    philosophical = False
    phil_topic = ""
    msg_lower = owner_message.lower()
    for kw in _PHILOSOPHICAL_KEYWORDS:
        if kw in msg_lower:
            philosophical = True
            phil_topic = kw
            break

    # 소스 타입 기반 confidence
    confidence = _calc_confidence(integrated)

    return LearningOutput(
        emotion_label=emotion,
        intensity=float(intensity),
        preference_signals=preference_signals,
        philosophical_moment=philosophical,
        philosophical_topic=phil_topic,
        insight=internal.self_reflection or internal.thought[:100],
        confidence=confidence,
    )


def _calc_confidence(integrated) -> float:
    """
    감각 소스 타입에 따른 신뢰도 계산.
    multimodal(audio+text) > audio mismatch > visual > text
    """
    if integrated.has_audio_mismatch:
        return 0.7  # 불일치 — 불확실
    if integrated.dominant_channel == "audio":
        return 0.95
    if integrated.dominant_channel == "visual":
        return 0.85
    return 0.8  # text only


def _summarize_experience(exp: Experience) -> str:
    """경험을 검색 가능한 텍스트로 요약한다."""
    parts = []
    if exp.sensory.text:
        parts.append(f"owner: {exp.sensory.text[:80]}")
    if exp.hana_response:
        parts.append(f"hana: {exp.hana_response[:80]}")
    if exp.learning.emotion_label != "NEUTRAL":
        parts.append(f"emotion: {exp.learning.emotion_label}")
    if exp.learning.philosophical_moment:
        parts.append(f"philosophical: {exp.learning.philosophical_topic}")
    if exp.internal.self_reflection:
        parts.append(f"reflection: {exp.internal.self_reflection[:60]}")
    return " | ".join(parts)


async def _handle_philosophical_moment(
    topic: str,
    context: str,
    internal_thought: str,
) -> None:
    """철학적 질문/순간을 기록한다."""
    try:
        from backend.services.philosophy_service import record_philosophical_moment
        await record_philosophical_moment(
            topic=topic,
            context=context,
            thought=internal_thought,
        )
    except (ImportError, Exception) as e:
        logger.debug("philosophy_service not available: %s", e)
