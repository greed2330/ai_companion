"""
삐짐(sulky) 상태 관리 서비스.
인메모리 상태만 사용한다 — 서버 재시작 시 초기화됨.
"""

import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

_sulky: bool = False
_since: Optional[datetime] = None

# 삐짐 상태를 해제하는 키워드
RECONCILE_KEYWORDS: list[str] = ["미안", "미안해", "왜 삐쳤어", "풀어줘", "잘못했어"]


def is_sulky() -> bool:
    """현재 삐짐 상태 여부를 반환한다."""
    return _sulky


def trigger_sulky() -> None:
    """삐짐 상태로 전환한다."""
    global _sulky, _since
    _sulky = True
    _since = datetime.now()
    logger.info("sulky: triggered")


def resolve_sulky() -> None:
    """삐짐 상태를 해제한다."""
    global _sulky, _since
    _sulky = False
    _since = None
    logger.info("sulky: resolved")


def check_reconcile(message: str) -> bool:
    """
    메시지에 화해 키워드가 포함되면 삐짐 해제 후 True 반환.
    삐진 상태가 아니거나 키워드가 없으면 False.
    """
    if not _sulky:
        return False
    if any(k in message for k in RECONCILE_KEYWORDS):
        resolve_sulky()
        return True
    return False
