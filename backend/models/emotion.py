"""
감정(Emotion) → 무드(Mood) 매핑 상수.
ResponseParser가 반환하는 감정 이름을 MoodType으로 변환한다.
"""

EMOTION_TO_MOOD: dict[str, str] = {
    "HAPPY":        "HAPPY",
    "EXCITED":      "HAPPY",
    "CURIOUS":      "CURIOUS",
    "CONCERNED":    "CONCERNED",
    "AFFECTIONATE": "HAPPY",
    "SULKY":        "IDLE",
    "IDLE":         "IDLE",
    "SLEEPY":       "SLEEPY",
    "GAMING":       "GAMING",
    "FOCUSED":      "FOCUSED",
}
