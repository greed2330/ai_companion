"""
relationship_warmth 관리.
세션 종료마다 warmth 증가, 7일 이상 공백 시 decay.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_WARMTH_LEVELS = [
    (0.0, 0.3, "아직 오너를 잘 모르는 상태야. 조심스럽게 탐색하며 대화해. 가정보다 질문을 먼저."),
    (0.3, 0.6, "익숙해지는 중이야. 점점 편해지고 있어. 가끔 장난기를 섞어도 돼."),
    (0.6, 0.8, "친한 사이야. 설명 없이도 통하는 것들이 생기고 있어."),
    (0.8, 1.1, "오래된 사이야. 당연히 알고 있는 것들이 있어. 설명 없이 바로 핵심으로."),
]


def get_warmth_hint(warmth: float) -> str:
    """warmth 값 → 관계 온도 힌트 문자열."""
    for lo, hi, hint in _WARMTH_LEVELS:
        if lo <= warmth < hi:
            return hint
    return _WARMTH_LEVELS[-1][2]


async def update_warmth_after_session(
    session_quality: float,
    session_duration_min: int,
) -> None:
    """세션 종료 시 warmth 증가. Celery 태스크에서 호출."""
    try:
        from backend.services.hana_state_service import get_state, update_state
        s = await get_state()
        current = float(s.get("relationship_warmth", 0.0))
        duration_weight = min(1.2, session_duration_min / 30)
        delta = session_quality * 0.02 * duration_weight
        new_warmth = min(1.0, current + delta)
        await update_state(
            relationship_warmth=new_warmth,
            warmth_updated_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.info("warmth updated: %.3f → %.3f", current, new_warmth)
    except Exception as e:
        logger.warning("update_warmth_after_session failed: %s", e)


async def decay_warmth_if_idle() -> None:
    """7일 이상 대화 없으면 warmth 소폭 감소. decay_tasks에서 매일 호출."""
    try:
        from backend.services.hana_state_service import get_state, update_state
        s = await get_state()
        last = s.get("warmth_updated_at")
        if not last:
            return
        last_dt = datetime.fromisoformat(last)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        days_idle = (datetime.now(timezone.utc) - last_dt).days
        if days_idle >= 7:
            current = float(s.get("relationship_warmth", 0.0))
            new_warmth = max(0.0, current * 0.995)
            await update_state(relationship_warmth=new_warmth)
            logger.info("warmth decayed (idle %d days): %.3f → %.3f", days_idle, current, new_warmth)
    except Exception as e:
        logger.warning("decay_warmth_if_idle failed: %s", e)
