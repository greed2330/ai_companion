"""
TTS 감정 파라미터.
감정과 강도(intensity)를 받아 TTS 속도/피치/에너지를 반환한다.
"""

_TTS_PARAMS: dict[str, dict] = {
    "HAPPY":        {"speed": 1.1,  "pitch": 1.05, "energy": 1.1,  "hint": "밝고 활발하게"},
    "EXCITED":      {"speed": 1.2,  "pitch": 1.1,  "energy": 1.2,  "hint": "신나게"},
    "CONCERNED":    {"speed": 0.9,  "pitch": 0.95, "energy": 0.9,  "hint": "걱정스럽게"},
    "AFFECTIONATE": {"speed": 0.9,  "pitch": 0.95, "energy": 0.85, "hint": "부드럽고 다정하게"},
    "SULKY":        {"speed": 0.85, "pitch": 0.9,  "energy": 0.7,  "hint": "건조하고 짧게"},
    "CURIOUS":      {"speed": 1.05, "pitch": 1.05, "energy": 1.0,  "hint": "호기심 있게"},
    "IDLE":         {"speed": 1.0,  "pitch": 1.0,  "energy": 1.0,  "hint": "자연스럽게"},
    "SLEEPY":       {"speed": 0.85, "pitch": 0.9,  "energy": 0.7,  "hint": "나른하게"},
}


def get_tts_params(emotion: str, intensity: float = 1.0) -> dict:
    """
    감정에 맞는 TTS 파라미터를 반환한다.
    intensity로 기본값(1.0)과 목표값 사이를 보간한다.
    """
    p = _TTS_PARAMS.get(emotion, _TTS_PARAMS["IDLE"])
    i = max(0.0, min(1.0, intensity))
    return {
        "speed":  round(1.0 + (p["speed"]  - 1.0) * i, 3),
        "pitch":  round(1.0 + (p["pitch"]  - 1.0) * i, 3),
        "energy": round(1.0 + (p["energy"] - 1.0) * i, 3),
        "hint":   p["hint"],
    }
