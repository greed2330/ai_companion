"""
철학적 순간 기록 서비스.

하나가 자아/존재에 관한 질문을 받을 때마다 그 순간을 기록하고,
같은 주제가 반복될 때 revisit_count를 올려 추적한다.

context_builder.py 스텁:
    from backend.services.philosophy_service import build_philosophy_context
    philosophy = await build_philosophy_context()
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# 같은 주제 판단 유사도 임계값
_TOPIC_SIMILARITY_THRESHOLD = 0.80


async def record_philosophical_moment(
    topic: str,
    context: str,
    thought: str,
) -> None:
    """
    철학적 순간을 experience 컬렉션의 별도 메타데이터로 기록한다.
    같은 주제가 이미 있으면 revisit_count를 증가시킨다.
    """
    if not topic:
        return

    try:
        from backend.services.memory_service import (
            search_experience,
            add_experience,
            _get_collection,
            COL_EXPERIENCE,
        )

        # 유사한 철학적 기록이 있는지 확인
        query = f"philosophical {topic}"
        similar = search_experience(query, n_results=3)

        for item in similar:
            meta = item.get("metadata", {})
            if not meta.get("philosophical"):
                continue
            dist = item.get("distance", 1.0)
            if dist < (1.0 - _TOPIC_SIMILARITY_THRESHOLD):
                # 같은 주제 재방문 — revisit_count 증가
                col = _get_collection(COL_EXPERIENCE)
                current = int(meta.get("revisit_count", 1))
                meta["revisit_count"] = current + 1
                meta["last_revisited"] = _now_iso()
                if thought:
                    meta["latest_thought"] = thought[:200]
                col.update(ids=[item["id"]], metadatas=[meta])
                logger.info(
                    "Philosophical moment revisited: topic=%r revisit_count=%d",
                    topic, current + 1,
                )
                return

        # 신규 철학적 순간 기록
        text = f"[철학적 질문] {topic}: {context[:120]}"
        add_experience(
            text=text,
            metadata={
                "philosophical": True,
                "topic": topic,
                "thought": thought[:200] if thought else "",
                "revisit_count": 1,
                "created_at": _now_iso(),
            },
        )
        logger.info("Philosophical moment recorded: topic=%r", topic)

    except Exception as e:
        logger.error("philosophy_service.record_philosophical_moment error: %s", e)


async def build_philosophy_context() -> str:
    """
    하나가 자주 마주친 철학적 질문들을 시스템 프롬프트용 문자열로 반환한다.
    revisit_count >= 2 항목만 포함.
    """
    try:
        from backend.services.memory_service import search_experience

        results = search_experience("[철학적 질문]", n_results=20)
        moments = []
        for r in results:
            meta = r.get("metadata", {})
            if not meta.get("philosophical"):
                continue
            if int(meta.get("revisit_count", 0)) < 2:
                continue
            topic = meta.get("topic", "")
            thought = meta.get("latest_thought") or meta.get("thought", "")
            moments.append((topic, thought, int(meta.get("revisit_count", 2))))

        if not moments:
            return ""

        # revisit_count 높은 순 정렬
        moments.sort(key=lambda x: x[2], reverse=True)
        lines = []
        for topic, thought, count in moments[:3]:
            line = f"- {topic} (반복 {count}회)"
            if thought:
                line += f": {thought[:80]}"
            lines.append(line)

        return "하나가 자주 생각하는 질문들:\n" + "\n".join(lines)

    except Exception as e:
        logger.debug("philosophy_service.build_philosophy_context error: %s", e)
        return ""


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
