"""
LLM 자동 채점 태스크.
어시스턴트 응답을 worker LLM(qwen3:4b)으로 채점하고
feedback 테이블을 업데이트한다.
final_score >= 0.7이면 hana_dataset_message(ChromaDB)에 저장.
"""

import asyncio
import json
import logging
import os

from backend.celery_app import celery_app

logger = logging.getLogger(__name__)

# AGENTS.md: final_score >= 0.7 → Layer 1 저장
DATASET_THRESHOLD: float = 0.7

# implicit_signal → 점수 변환
_SIGNAL_SCORES: dict[str, float] = {
    "follow_up": 1.0,
    "executed":  0.9,
    "retry":     0.3,
    "ignored":   0.1,
}

_SCORING_PROMPT = """\
아래 대화에서 하나(AI 파트너)의 응답을 0.0~1.0으로 채점해줘.

평가 기준 (각 항목 합산):
1. 하나의 성격(친근한 반말, 공감, 솔직함) 부합도 (0~0.4)
2. 사용자 메시지와의 관련성 (0~0.3)
3. 자연스럽고 대화스러운 표현 (0~0.3)

사용자: {user_message}
하나: {assistant_response}

반드시 JSON만 응답해: {{"score": 0.0, "reason": "한 줄 이유"}}"""


def _calc_final_score(
    explicit_score: int | None,
    auto_score: float,
    implicit_signal: str | None,
) -> float:
    """
    explicit(1~5 정수), auto(0~1), implicit 신호로 final_score 계산.
    AGENTS.md: final_score = explicit×0.4 + auto×0.4 + implicit×0.2
    값이 없으면 auto_score를 대리 사용.
    """
    explicit_norm = (explicit_score / 5.0) if explicit_score else auto_score
    implicit_norm = _SIGNAL_SCORES.get(implicit_signal, 0.5) if implicit_signal else 0.5
    return round(explicit_norm * 0.4 + auto_score * 0.4 + implicit_norm * 0.2, 3)


@celery_app.task(name="score_tasks.score_message")
def score_message(
    message_id: str,
    user_message: str,
    assistant_response: str,
    interaction_type: str | None = None,
) -> dict:
    """
    어시스턴트 응답 하나를 채점하고 feedback 테이블과 ChromaDB를 업데이트한다.

    Parameters
    ----------
    message_id         : 채점 대상 messages.id
    user_message       : 오너의 질문/입력
    assistant_response : 하나의 응답 전문
    interaction_type   : 'coding' | 'game' | 'general' | None
    """
    logger.info("Celery task start: score_message message_id=%s", message_id)
    try:
        result = asyncio.get_event_loop().run_until_complete(
            _score_async(message_id, user_message, assistant_response, interaction_type)
        )
        logger.info(
            "Celery task complete: score_message message_id=%s score=%.3f final=%.3f saved=%s",
            message_id, result["auto_score"], result["final_score"], result["saved_to_dataset"],
        )
        return result
    except Exception as exc:
        logger.error("Celery task failure: score_message message_id=%s error=%s", message_id, exc)
        raise


async def _score_async(
    message_id: str,
    user_message: str,
    assistant_response: str,
    interaction_type: str | None,
) -> dict:
    from backend.services.llm_router import llm_router

    # 1. Worker LLM에 채점 요청
    prompt = _SCORING_PROMPT.format(
        user_message=user_message[:500],
        assistant_response=assistant_response[:800],
    )
    raw = await llm_router.call_for_text(
        messages=[{"role": "user", "content": prompt}],
        system_prompt="You are a response quality evaluator. Reply with JSON only.",
    )

    auto_score = _parse_score(raw)
    logger.debug("score_message: raw=%r auto_score=%.3f", raw[:100], auto_score)

    # 2. 기존 feedback 행 조회 (explicit_score, implicit_signal)
    explicit_score, implicit_signal = await _fetch_existing_feedback(message_id)
    final_score = _calc_final_score(explicit_score, auto_score, implicit_signal)

    # 3. feedback 테이블 upsert
    await _upsert_feedback(message_id, auto_score, final_score)

    # 4. final_score >= 0.7 → Layer 1 dataset 저장
    saved = False
    if final_score >= DATASET_THRESHOLD and len(assistant_response.strip()) > 30:
        saved = _save_to_dataset(
            message_id=message_id,
            user_message=user_message,
            assistant_response=assistant_response,
            interaction_type=interaction_type,
            final_score=final_score,
        )

    return {
        "message_id":      message_id,
        "auto_score":      auto_score,
        "final_score":     final_score,
        "saved_to_dataset": saved,
    }


def _parse_score(raw: str) -> float:
    """LLM 응답에서 score 값을 추출한다. 실패하면 중간값 0.5 반환."""
    try:
        # JSON 블록만 추출
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(raw[start:end])
            score = float(data.get("score", 0.5))
            return max(0.0, min(1.0, score))
    except (json.JSONDecodeError, ValueError, KeyError):
        pass
    return 0.5


async def _fetch_existing_feedback(message_id: str) -> tuple[int | None, str | None]:
    """현재 feedback 행의 explicit_score와 implicit_signal을 조회한다."""
    import aiosqlite
    from backend.models.schema import DB_PATH

    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT explicit_score, implicit_signal FROM feedback WHERE message_id = ?",
            (message_id,),
        ) as cursor:
            row = await cursor.fetchone()

    if row:
        return row[0], row[1]
    return None, None


async def _upsert_feedback(
    message_id: str,
    auto_score: float,
    final_score: float,
) -> None:
    """feedback 테이블에 auto_score와 final_score를 저장(없으면 INSERT, 있으면 UPDATE)."""
    import aiosqlite
    from backend.models.schema import DB_PATH

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO feedback (message_id, auto_score, final_score)
            VALUES (?, ?, ?)
            ON CONFLICT(message_id) DO UPDATE SET
                auto_score  = excluded.auto_score,
                final_score = excluded.final_score
            """,
            (message_id, auto_score, final_score),
        )
        await db.commit()


def _save_to_dataset(
    message_id: str,
    user_message: str,
    assistant_response: str,
    interaction_type: str | None,
    final_score: float,
) -> bool:
    """final_score >= 0.7인 문답 쌍을 hana_dataset_message(ChromaDB)에 저장한다."""
    try:
        from backend.services.memory_service import add_dataset_candidate

        text = f"사용자: {user_message}\n하나: {assistant_response}"
        add_dataset_candidate(
            text=text,
            metadata={
                "message_id":      message_id,
                "interaction_type": interaction_type or "general",
                "final_score":     final_score,
                "layer":           "message",
            },
        )
        return True
    except Exception as exc:
        logger.warning("dataset save failed: %s", exc)
        return False
