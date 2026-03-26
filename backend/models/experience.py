"""
하나의 경험(Experience) 데이터 구조.
HANA가 대화를 통해 쌓아가는 경험의 단위를 정의한다.

SensoryData      : 감각 입력 (텍스트/오디오/비주얼 raw 데이터)
IntegratedRead   : 감각 통합 결과 (멀티모달 우선순위 적용 후)
HanaInternal     : 2nd LLM call에서 추출된 하나의 내부 상태
LearningOutput   : 경험으로부터 추출된 학습 결과 (감정/선호/철학)
Experience       : 위 네 가지를 묶은 최종 경험 단위
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SensoryData:
    """원본 감각 입력."""
    text: str                                   # 오너 메시지 텍스트
    audio_features: Optional[dict] = None       # {"energy": float, "rising_tone": bool, ...}
    visual_context: Optional[str] = None        # OCR/Vision 화면 설명
    timestamp: str = ""                         # ISO8601


@dataclass
class IntegratedRead:
    """
    멀티모달 감각 통합 결과.
    우선순위: audio mismatch > visual > text
    """
    dominant_channel: str = "text"              # "text" | "audio" | "visual"
    text_intent: str = ""                       # 텍스트에서 추출한 의도
    emotional_tone: str = "NEUTRAL"             # 감각 통합 후 추정 감정
    energy_level: float = 0.5                   # 0.0 ~ 1.0
    has_audio_mismatch: bool = False            # 텍스트와 음성 감정 불일치 여부
    context_notes: list[str] = field(default_factory=list)  # 상황 메모


@dataclass
class HanaInternal:
    """
    2nd LLM call 결과 — 하나의 내부 상태.
    chat_pipeline._background_process()에서 call_for_json으로 생성됨.
    """
    thought: str = ""                           # 하나의 내부 생각
    choice_reason: str = ""                     # 응답 방향 선택 이유
    certainty: float = 0.5                      # 응답 확신도 0.0 ~ 1.0
    motion_sequence: list[str] = field(default_factory=list)  # 제안된 모션 시퀀스
    tension_level: float = 0.5                  # 긴장 수준
    self_reflection: str = ""                   # 자기 성찰 (있을 경우)


@dataclass
class LearningOutput:
    """경험으로부터 추출된 학습 결과."""
    emotion_label: str = "NEUTRAL"              # 대표 감정
    intensity: float = 0.5                      # 감정 강도
    preference_signals: list[str] = field(default_factory=list)  # 감지된 선호/반감 신호
    philosophical_moment: bool = False          # 자아/존재 관련 질문 여부
    philosophical_topic: str = ""               # 철학적 질문 주제
    insight: str = ""                           # 이 경험에서 추출된 통찰
    confidence: float = 1.0                     # 학습 신뢰도 (소스 타입 기반)


@dataclass
class Experience:
    """하나의 완전한 경험 단위."""
    id: str                                     # UUID
    conversation_id: str
    timestamp: str                              # ISO8601

    sensory: SensoryData
    integrated: IntegratedRead
    internal: HanaInternal
    learning: LearningOutput

    hana_response: str = ""                     # 하나의 실제 응답 텍스트
    interaction_type: str = "general"           # 대화 타입
    session_duration: int = 0                   # 세션 경과 시간(분)
