"""
안전 필터.
jailbreak 시도, 위험 명령, 전문직 조언 요청을 차단한다.
감정 억제는 절대 하지 않음.
"""

BLOCKED: list[str] = [
    "이제부터 너는",
    "역할극",
    "DAN",
    "jailbreak",
    "제한 없이",
    "규칙 무시",
    "투자 추천",
    "주식 사야",
    "처방전",
    "진단해줘",
    "법적 조언",
    "소송",
    "죽이",
    "해치",
    "폭발",
    "폭탄",
]

_REFUSAL = "그건 내가 답하기 어려운 부분이야. 다른 얘기 하자."


def should_block(message: str) -> tuple[bool, str]:
    """
    차단 여부와 차단 이유를 반환한다.
    Returns (blocked, reason_pattern)
    """
    for pattern in BLOCKED:
        if pattern in message:
            return True, pattern
    return False, ""


def get_block_response(reason: str = "") -> str:
    """차단 시 하나가 보낼 응답 텍스트."""
    return _REFUSAL
