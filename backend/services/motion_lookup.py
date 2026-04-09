"""
감정 → 모션/텐션 룩업 테이블.
LLM 호출 없이 결정론적으로 반환한다.

chat_pipeline._background_process의 2nd LLM call을 대체한다.
"""

EMOTION_MOTION_MAP: dict[str, list[str]] = {
    "HAPPY":        ["bounce", "wave"],
    "CONCERNED":    ["lean_forward", "tilt_head"],
    "EXCITED":      ["jump", "spin"],
    "CURIOUS":      ["tilt_head", "look_around"],
    "AFFECTIONATE": ["nod", "smile"],
    "GAMING":       ["cheer", "lean_forward"],
    "SLEEPY":       ["slow_sway", "yawn"],
    "IDLE":         ["idle_sway"],
}

EMOTION_TENSION_MAP: dict[str, float] = {
    "HAPPY":        0.7,
    "CONCERNED":    1.0,
    "EXCITED":      0.9,
    "CURIOUS":      0.6,
    "AFFECTIONATE": 0.5,
    "GAMING":       0.8,
    "SLEEPY":       0.2,
    "IDLE":         0.3,
}


def get_motion_data(emotion: str, intensity: float) -> dict:
    """emotion + intensity로 motion_sequence, tension_level을 반환한다.

    Args:
        emotion: ParsedResponse.emotion 값 (예: "HAPPY", "CONCERNED")
        intensity: ParsedResponse.intensity 값 (0.0~1.0)

    Returns:
        {"motion_sequence": [...], "tension_level": float}
        프론트에서 emotion_update SSE로 수신하는 것과 동일한 키/타입.
    """
    motions = EMOTION_MOTION_MAP.get(emotion, EMOTION_MOTION_MAP["IDLE"])
    base_tension = EMOTION_TENSION_MAP.get(emotion, 0.5)
    return {
        "motion_sequence": motions,
        "tension_level":   round(base_tension * max(0.1, intensity), 2),
    }
