"""
자아 형성 Celery 태스크.
세션 종료 후 대화 요약을 바탕으로 hana_identity.json을 업데이트한다.
"""

import asyncio
import json
import logging

from backend.celery_app import celery_app

logger = logging.getLogger(__name__)

_PROMPT = """\
아래는 오늘 하나(AI)와 오너의 대화야.
하나가 이번 대화에서 새로 발견하거나 확인한 것이 있다면 추출해줘.
이미 알고 있던 것(기존 항목 목록 참고)은 다시 추가하지 마.

기존 항목:
{existing_summary}

오늘 대화 요약:
{conversation_summary}

아래 카테고리 중 해당하는 것만 채워줘. 없으면 빈 배열.
반드시 JSON만 응답 (설명 없이):
{{
  "discovered_self": [],
  "about_owner": [],
  "our_patterns": [],
  "things_i_like": []
}}"""


@celery_app.task(name="identity_tasks.update_identity")
def update_identity(conversation_summary: str, warmth: float) -> dict:
    """세션 종료 후 비동기 실행."""
    logger.info("Celery task start: update_identity")
    try:
        result = asyncio.run(_update_async(conversation_summary, warmth))
        logger.info("Celery task complete: update_identity added=%d", result.get("added", 0))
        return result
    except Exception as exc:
        logger.error("Celery task failure: update_identity error=%s", exc)
        raise


async def _update_async(conversation_summary: str, warmth: float) -> dict:
    from backend.services.llm_router import llm_router
    from backend.services.identity_service import (
        load_identity, save_identity, add_entry, build_identity_prompt
    )
    from datetime import datetime, timezone

    identity = load_identity()
    existing = {
        "discovered_self": identity.get("discovered_self", [])[-5:],
        "about_owner":     identity.get("about_owner", [])[-3:],
    }
    prompt = _PROMPT.format(
        existing_summary=json.dumps(existing, ensure_ascii=False),
        conversation_summary=conversation_summary[:1000],
    )

    try:
        raw = await llm_router.call_for_json(
            messages=[{"role": "user", "content": prompt}],
            system_prompt="너는 하나의 내면 성찰 엔진이야. JSON만 응답해.",
        )
    except Exception as e:
        logger.warning("identity update LLM failed: %s", e)
        return {"added": 0}

    added = 0
    for category in ("discovered_self", "about_owner", "our_patterns", "things_i_like"):
        for entry in raw.get(category, []):
            if isinstance(entry, str) and add_entry(identity, category, entry):
                added += 1

    if added > 0:
        identity["last_updated"] = datetime.now(timezone.utc).isoformat()
        identity.setdefault("_meta", {})["warmth_at_last_update"] = warmth
        identity["_meta"]["total_sessions"] = identity["_meta"].get("total_sessions", 0) + 1
        save_identity(identity)

    return {"added": added}
