"""
hana_identity.json 관리.
세션 종료 시 Celery가 LLM으로 새 항목 추가.
context_builder가 warmth >= 0.3이면 시스템 프롬프트에 주입.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_IDENTITY_PATH = Path("data/hana_identity.json")
_MAX_ENTRIES = 15  # 카테고리별 최대 항목 수

_EMPTY: dict = {
    "version":         1,
    "last_updated":    None,
    "discovered_self": [],   # 하나가 자신에 대해 발견한 것 (1인칭)
    "about_owner":     [],   # 오너에 대해 알게 된 것
    "our_patterns":    [],   # 둘 사이의 패턴
    "things_i_like":   [],   # 하나가 좋아하게 된 것
    "_meta": {"total_sessions": 0, "warmth_at_last_update": 0.0},
}


def load_identity() -> dict:
    try:
        if _IDENTITY_PATH.exists():
            return json.loads(_IDENTITY_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("identity: load failed: %s", e)
    return {k: (list(v) if isinstance(v, list) else v) for k, v in _EMPTY.items()}


def save_identity(identity: dict) -> None:
    _IDENTITY_PATH.parent.mkdir(parents=True, exist_ok=True)
    _IDENTITY_PATH.write_text(
        json.dumps(identity, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def build_identity_prompt(identity: dict, warmth: float) -> str:
    """warmth >= 0.3 + 항목 있을 때만 반환. 없으면 빈 문자열."""
    if warmth < 0.3:
        return ""
    lines: list[str] = []
    for entry in identity.get("discovered_self", [])[-5:]:
        lines.append(f"- (나에 대해) {entry}")
    for entry in identity.get("about_owner", [])[-3:]:
        lines.append(f"- (오너에 대해) {entry}")
    for entry in identity.get("our_patterns", [])[-3:]:
        lines.append(f"- (우리 패턴) {entry}")
    if not lines:
        return ""
    return "## 내가 지금까지 알게 된 것들\n" + "\n".join(lines)


def add_entry(identity: dict, category: str, entry: str) -> bool:
    """중복 없을 때만 추가. 반환: 실제 추가됐는지."""
    entries = identity.setdefault(category, [])
    prefix = entry[:10]
    if any(e[:10] == prefix for e in entries):
        return False
    entries.append(entry)
    if len(entries) > _MAX_ENTRIES:
        entries.pop(0)
    return True
