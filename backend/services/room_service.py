"""
대화 룸 타입 감지 서비스.
메시지 내용과 자율 컨텍스트를 분석해 현재 대화 성격을 분류한다.

룸 타입: 'game' | 'general'
코딩은 14B 모델 수준에서 별도 모드를 둘 필요가 없어 general로 통합됨.
"""

import logging

logger = logging.getLogger(__name__)

# 룸 타입별 키워드 (game만 유지)
_ROOM_KW: dict[str, list[str]] = {
    "game": ["게임", "롤", "마인크래프트", "스팀", "플레이", "죽었", "이겼", "레이드"],
}

# SSE room_change 이벤트용 메시지
ROOM_MESSAGES: dict[str, str] = {
    "game":    "게임 얘기네!",
    "general": "일반 대화~",
}


def detect_room_type(message: str, autonomous_context: str = None) -> str:
    """
    메시지와 자율 컨텍스트를 분석해 룸 타입을 반환한다.

    Returns: 'game' | 'general'
    """
    if autonomous_context and "게임" in autonomous_context:
        return "game"

    msg_lower = message.lower()
    for room, kws in _ROOM_KW.items():
        if any(k in msg_lower for k in kws):
            logger.debug("room_service: detected '%s' from message", room)
            return room

    return "general"
