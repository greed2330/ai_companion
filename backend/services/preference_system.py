"""
선호/가치 누적 시스템.

선호 신호가 PROMOTION_THRESHOLD(5회) 이상 누적되면
hana_memory_longterm에 자동 승격되어 시스템 프롬프트에 주입된다.

context_builder.py의 스텁:
    from backend.services.preference_service import preference_system
    preferences = await preference_system.get_context_string()
이 코드가 이 모듈을 찾도록 preference_service.py에서 re-export한다.
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# 같은 내용이 이 횟수 이상 누적되면 longterm으로 승격
PROMOTION_THRESHOLD = 5
# 코사인 유사도 기반 같은 신호 판단 임계값 (ChromaDB distance < 1 - SIMILARITY_THRESHOLD)
SIMILARITY_THRESHOLD = 0.85


class PreferenceSystem:
    """
    하나의 선호/가치를 누적하고 관리한다.

    선호 신호 → preference 컬렉션 누적 →
    임계값 초과 시 longterm 자동 승격 → 시스템 프롬프트 주입
    """

    async def record_signal(self, signal: str, context: str = "") -> None:
        """
        선호 신호를 기록한다.
        유사한 신호가 이미 있으면 count를 증가시키고 임계값 확인 후 승격.
        """
        if not signal or not signal.strip():
            return

        try:
            from backend.services.memory_service import (
                add_preference,
                search_preference,
                update_preference_count,
                add_longterm,
            )

            # 유사한 선호가 이미 있는지 확인
            similar = search_preference(signal, n_results=3)
            for item in similar:
                dist = item.get("distance", 1.0)
                if dist < (1.0 - SIMILARITY_THRESHOLD):
                    # 유사 항목 존재 → count 증가
                    new_count = update_preference_count(item["id"])
                    logger.debug(
                        "Preference count updated: signal=%r count=%d",
                        signal[:40], new_count,
                    )
                    if new_count >= PROMOTION_THRESHOLD:
                        await self._promote_to_longterm(item, signal)
                    return

            # 신규 선호 신호 추가
            add_preference(
                text=signal,
                metadata={
                    "context": context[:200],
                    "count": 1,
                    "promoted": False,
                },
            )
            logger.debug("New preference signal recorded: %r", signal[:40])

        except Exception as e:
            logger.error("preference_system.record_signal error: %s", e)

    async def _promote_to_longterm(self, preference_item: dict, original_signal: str) -> None:
        """선호 신호를 장기 기억으로 승격한다."""
        try:
            from backend.services.memory_service import (
                add_longterm,
                update_preference_count,
            )
            import chromadb
            from backend.services.memory_service import _get_collection, COL_PREFERENCE

            text = preference_item.get("text", original_signal)
            meta = preference_item.get("metadata", {})

            # 이미 승격된 경우 건너뜀
            if meta.get("promoted"):
                return

            longterm_text = f"[HANA 선호] {text}"
            added_id = add_longterm(
                text=longterm_text,
                metadata={
                    "source": "preference_promotion",
                    "original_signal": text[:100],
                    "promotion_count": int(meta.get("count", PROMOTION_THRESHOLD)),
                    "confidence": 1.0,
                },
            )

            if added_id:
                # 승격 표시
                col = _get_collection(COL_PREFERENCE)
                meta["promoted"] = True
                meta["promoted_to"] = added_id
                col.update(ids=[preference_item["id"]], metadatas=[meta])
                logger.info("Preference promoted to longterm: %r", text[:60])

        except Exception as e:
            logger.error("preference_system._promote_to_longterm error: %s", e)

    async def get_context_string(self) -> str:
        """
        승격된 선호 항목을 시스템 프롬프트용 문자열로 반환한다.
        """
        try:
            from backend.services.memory_service import search_longterm

            results = search_longterm("[HANA 선호]", n_results=10)
            prefs = [
                r["text"].replace("[HANA 선호] ", "")
                for r in results
                if "[HANA 선호]" in r.get("text", "")
            ]
            if not prefs:
                return ""
            return "하나의 성향:\n" + "\n".join(f"- {p}" for p in prefs[:5])

        except Exception as e:
            logger.debug("preference_system.get_context_string error: %s", e)
            return ""

    async def get_all(self) -> list[dict]:
        """API용: 모든 선호 항목 반환."""
        try:
            from backend.services.memory_service import get_all_preferences
            return get_all_preferences()
        except Exception:
            return []


# 모듈 레벨 싱글톤
preference_system = PreferenceSystem()
