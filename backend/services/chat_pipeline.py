"""
채팅 파이프라인.
routers/chat.py는 이 모듈에 위임만 한다. 비즈니스 로직 전부 여기.

흐름:
  1. 안전 필터
  2. DB 설정 (conversation 생성, 메시지 저장, 히스토리 로드, 메모리 검색)
  3. 컨텍스트 빌드
  4. 스트리밍 (1st call)
  5. 룸 변경 SSE
  6. done 이벤트 전송
  7. 백그라운드: 감정 파싱 + motion_lookup + SSE emotion_update push + DB 저장
"""

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiosqlite
from fastapi import BackgroundTasks
from fastapi.responses import StreamingResponse

from backend.models.schema import DB_PATH
from backend.services.context_builder import build_context
from backend.services.llm import postprocess_for_voice
from backend.services.motion_lookup import get_motion_data
from backend.services.llm_router import llm_router
from backend.services.memory import search_memory, update_confidence
from backend.services.mood import get_mood, get_effective_mood, push_event, set_mood, push_tier3, tick_tier3
from backend.services.response_parser import parse_response
from backend.services.room_service import ROOM_MESSAGES, detect_room_type
from backend.services.safety_filter import get_block_response, should_block
from backend.services.session_judge import judge_session_start, save_session_end
from backend.services.settings_service import get_persona
from backend.services.tts_emotion import get_tts_params

logger = logging.getLogger(__name__)

_OWNER_USER_ID = "owner"

# 대화별 세션 시작 시각 (session_duration 계산용)
_session_start: dict[str, datetime] = {}
# 대화별 현재 룸 타입
_conversation_rooms: dict[str, str] = {}

# 인메모리 딕트 최대 항목 수 — 초과 시 오래된 항목부터 제거
_MAX_TRACKED_CONVERSATIONS = 500


def _evict_if_needed() -> None:
    """_session_start / _conversation_rooms가 한계를 초과하면 절반을 비운다."""
    if len(_session_start) > _MAX_TRACKED_CONVERSATIONS:
        oldest = list(_session_start.keys())[: _MAX_TRACKED_CONVERSATIONS // 2]
        for k in oldest:
            _session_start.pop(k, None)
            _conversation_rooms.pop(k, None)


# ---------------------------------------------------------------------------
# DB 헬퍼 (chat_pipeline 전용)
# ---------------------------------------------------------------------------


async def _ensure_conversation(db: aiosqlite.Connection, conversation_id: str) -> None:
    async with db.execute(
        "SELECT id FROM conversations WHERE id = ?", (conversation_id,)
    ) as cursor:
        row = await cursor.fetchone()
    if not row:
        await db.execute(
            "INSERT INTO conversations (id, started_at) VALUES (?, ?)",
            (conversation_id, datetime.now(timezone.utc).isoformat()),
        )
        await db.commit()


async def _get_message_count(
    db: aiosqlite.Connection, conversation_id: str
) -> int:
    async with db.execute(
        "SELECT COUNT(*) FROM messages WHERE conversation_id = ?",
        (conversation_id,),
    ) as cursor:
        row = await cursor.fetchone()
    return row[0] if row else 0


async def _get_last_assistant_time(
    db: aiosqlite.Connection, conversation_id: str
) -> Optional[datetime]:
    async with db.execute(
        "SELECT created_at FROM messages "
        "WHERE conversation_id = ? AND role = 'assistant' "
        "ORDER BY created_at DESC LIMIT 1",
        (conversation_id,),
    ) as cursor:
        row = await cursor.fetchone()
    if not row:
        return None
    ts = row[0]
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)


async def _load_recent_messages(
    db: aiosqlite.Connection, conversation_id: str, limit: int = 20
) -> list[dict]:
    async with db.execute(
        "SELECT role, content FROM messages "
        "WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
        (conversation_id, limit),
    ) as cursor:
        rows = await cursor.fetchall()
    return [{"role": r[0], "content": r[1]} for r in reversed(rows)]


async def _update_message_mood(message_id: str, mood: str) -> None:
    """백그라운드 감정 파싱 완료 후 messages.mood_at_response를 업데이트한다."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE messages SET mood_at_response = ? WHERE id = ?",
            (mood, message_id),
        )
        await db.commit()


async def _save_message(
    db: aiosqlite.Connection,
    message_id: str,
    conversation_id: str,
    role: str,
    content: str,
    mood: Optional[str] = None,
    response_time_ms: Optional[int] = None,
    owner_response_delay_ms: Optional[int] = None,
    interaction_type: Optional[str] = None,
    owner_emotion: Optional[str] = None,
) -> None:
    await db.execute(
        """
        INSERT INTO messages
            (id, conversation_id, role, content, mood_at_response,
             response_time_ms, owner_response_delay_ms, interaction_type,
             owner_emotion, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            message_id,
            conversation_id,
            role,
            content,
            mood,
            response_time_ms,
            owner_response_delay_ms,
            interaction_type,
            owner_emotion,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# 백그라운드 처리
# ---------------------------------------------------------------------------


def _compute_finetune_tags(
    parsed_emotion: str,
    tier2_mood_at_start: str,
    memories_used: list[dict],
    warmth: float,
) -> list[str]:
    """파인튜닝 태그 계산. 하나다운 순간 감지."""
    tags: list[str] = []
    if warmth > 0.5 and parsed_emotion != tier2_mood_at_start:
        tags.append("character_authentic")
    if any(m.get("emotional_weight", 0) > 0.7 for m in memories_used):
        tags.append("emotional_genuine")
    if memories_used:
        tags.append("relationship_memory")
    return tags


async def _save_finetune_tags(message_id: str, tags: list[str]) -> None:
    if not tags:
        return
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO feedback (message_id, finetune_tags)
            VALUES (?, ?)
            ON CONFLICT(message_id) DO UPDATE SET finetune_tags = excluded.finetune_tags
            """,
            (message_id, json.dumps(tags, ensure_ascii=False)),
        )
        await db.commit()


async def _background_process(
    full_response: str,
    original_message: str,
    conversation_id: str,
    assistant_msg_id: str,
    elapsed_ms: int,
    audio_features: Optional[dict],
    owner_emotion: str,
    interaction_type: Optional[str],
    timestamp: str,
    session_duration: int,
    ctx: dict,
    memories: Optional[list[dict]] = None,
) -> None:
    """스트리밍 완료 후 감정 파싱 / motion_lookup / SSE push / DB 저장."""
    if not full_response:
        return

    try:
        # 감정 파싱
        raw = full_response
        if llm_router.source == "protocol":
            raw = await llm_router.call_protocol_full([], ctx["system_prompt"], ctx["extra_context"])
        parsed = await parse_response(raw, original_message)

        # TTS 파라미터
        tts = get_tts_params(parsed.emotion, parsed.intensity)

        # 무드 업데이트 (백그라운드 단일 경로)
        from backend.models.emotion import EMOTION_TO_MOOD
        new_mood = EMOTION_TO_MOOD.get(parsed.emotion, "IDLE")
        tier2_mood_at_start = get_effective_mood()  # 변경 전 캡처
        set_mood(new_mood)
        tick_tier3()  # tier3 TTL 카운트다운
        await _update_message_mood(assistant_msg_id, new_mood)

        # 모션/텐션 — 룩업 테이블 (2nd LLM call 대체)
        motion_data = get_motion_data(parsed.emotion, parsed.intensity)

        # SSE: emotion_update
        push_event({
            "type":             "emotion_update",
            "emotion":          parsed.emotion,
            "mood":             new_mood,
            "motion_sequence":  motion_data["motion_sequence"],
            "tension_level":    motion_data["tension_level"],
            "tts_speed":        tts["speed"],
            "tts_pitch":        tts["pitch"],
            "tts_energy":       tts["energy"],
            "tts_hint":         tts["hint"],
        })

        # SPEC-06: warmth + finetune tags
        try:
            from backend.services import hana_state_service
            state = await hana_state_service.get_state()
            warmth = float(state.get("relationship_warmth", 0.0))
            tags = _compute_finetune_tags(
                parsed.emotion, tier2_mood_at_start, memories or [], warmth
            )
            await _save_finetune_tags(assistant_msg_id, tags)
        except Exception as e:
            logger.warning("finetune_tags 계산 실패: %s", e)

        # 세션 종료 상태 저장
        save_session_end(parsed.emotion, parsed.topic)

        # experience 수집 스텁 (PROMPT_06에서 채워짐)
        try:
            from backend.services.experience_collector import collect_experience_background  # type: ignore[import]
            await collect_experience_background(
                full_response=full_response,
                parsed=parsed,
                internal_json=motion_data,
                audio_features=audio_features,
                owner_emotion=owner_emotion,
                timestamp=timestamp,
                session_duration=session_duration,
                conversation_id=conversation_id,
            )
        except (ImportError, Exception):
            pass

        # Celery: LLM 자동 채점 (fire-and-forget)
        try:
            from backend.tasks.score_tasks import score_message
            score_message.delay(
                message_id=assistant_msg_id,
                user_message=original_message,
                assistant_response=full_response,
                interaction_type=interaction_type,
            )
        except Exception as score_exc:
            logger.warning("score_message.delay failed: %s", score_exc)

        logger.info(
            "_background_process: cid=%s emotion=%s mood=%s",
            conversation_id, parsed.emotion, new_mood,
        )

    except Exception as e:
        logger.error("_background_process error: cid=%s error=%s", conversation_id, e)


# ---------------------------------------------------------------------------
# 메인 파이프라인
# ---------------------------------------------------------------------------


async def run_chat_pipeline(
    message: str,
    conversation_id: Optional[str],
    interaction_type: Optional[str],
    voice_mode: bool,
    audio_features: Optional[dict],
    owner_emotion: Optional[str],
    background_tasks: BackgroundTasks,
) -> StreamingResponse:
    """
    /chat 요청을 처리하고 SSE StreamingResponse를 반환한다.

    Parameters
    ----------
    message, conversation_id, interaction_type, voice_mode :
        ChatRequest 필드 그대로
    audio_features : {"energy": float, "rising_tone": bool} or None
    owner_emotion  : 오너 감정 힌트 ("NEUTRAL" | "HAPPY" | "DISTRESSED" | None)
    background_tasks : FastAPI BackgroundTasks
    """
    # 1. 안전 필터 (DB 불필요)
    blocked, reason = should_block(message)
    if blocked:
        logger.warning("safety_filter: blocked reason=%s", reason)

        async def _blocked_stream():
            block_text = get_block_response(reason)
            yield f"data: {json.dumps({'type': 'token', 'content': block_text}, ensure_ascii=False)}\n\n"
            yield "data: {\"type\": \"done\", \"mood\": \"IDLE\"}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(_blocked_stream(), media_type="text/event-stream")

    cid = conversation_id or str(uuid.uuid4())
    request_time = datetime.now(timezone.utc)
    resolved_owner_emotion = owner_emotion or "NEUTRAL"

    # 세션 경과 시간
    if cid not in _session_start:
        _evict_if_needed()
        _session_start[cid] = datetime.now()
    session_min = int((datetime.now() - _session_start[cid]).total_seconds() / 60)

    logger.info("/chat request received: conversation_id=%s", cid)

    async def event_stream():
        async with aiosqlite.connect(DB_PATH) as db:
            # DB 설정
            await _ensure_conversation(db, cid)

            is_first = (await _get_message_count(db, cid)) == 0

            last_time = await _get_last_assistant_time(db, cid)
            delay_ms = (
                int((request_time - last_time).total_seconds() * 1000)
                if last_time
                else None
            )
            # SPEC-06: 전체 대화 기준 마지막 어시스턴트 응답으로부터 경과 시간
            gap_hours: Optional[float] = None
            if is_first or not last_time:
                async with db.execute(
                    "SELECT created_at FROM messages WHERE role='assistant' "
                    "ORDER BY created_at DESC LIMIT 1"
                ) as _c:
                    _row = await _c.fetchone()
                if _row:
                    try:
                        _ts = _row[0]
                        _last = datetime.fromisoformat(_ts.replace("Z", "+00:00"))
                        gap_hours = (request_time - _last).total_seconds() / 3600
                    except Exception:
                        pass
            elif last_time:
                gap_hours = (request_time - last_time).total_seconds() / 3600

            user_msg_id = str(uuid.uuid4())
            await _save_message(
                db, user_msg_id, cid, "user", message,
                owner_response_delay_ms=delay_ms,
                interaction_type=interaction_type,
                owner_emotion=resolved_owner_emotion,
            )

            # 룸 감지
            new_room = detect_room_type(message)
            old_room = _conversation_rooms.get(cid, "general")
            if new_room != old_room:
                _conversation_rooms[cid] = new_room
                room_event = {
                    "type":      "room_change",
                    "room_type": new_room,
                    "message":   ROOM_MESSAGES.get(new_room, ""),
                }
                # /chat SSE에만 전송 (push_event는 /mood/stream 전용이므로 room_change 제외)
                yield f"data: {json.dumps(room_event, ensure_ascii=False)}\n\n"

            # 히스토리 + 메모리 병렬 조회
            # 짧은 잡담(≤12자)·게임 즉각반응은 메모리 검색 생략 (지연 방지)
            _skip_memory = len(message.strip()) <= 12 or interaction_type == "game"
            if _skip_memory:
                history, memories = await asyncio.gather(
                    _load_recent_messages(db, cid),
                    asyncio.sleep(0, result=[]),
                )
            else:
                history, memories = await asyncio.gather(
                    _load_recent_messages(db, cid),
                    search_memory(_OWNER_USER_ID, message),
                )
            for mem in memories:
                await update_confidence(mem["id"], delta=0.1)

            # 세션 시작 판단 (1회만 호출)
            session_hint = ""
            if is_first:
                sc = judge_session_start(
                    first_message=message,
                    audio_energy=audio_features.get("energy") if audio_features else None,
                )
                session_hint = sc.system_hint or ""
                if sc.proactive_msg:
                    push_event({"type": "proactive", "message": sc.proactive_msg})

            # 컨텍스트 빌드
            current_mood = get_mood()["mood"]
            persona = get_persona()
            ctx = await build_context(
                message=message,
                mood=current_mood,
                persona=persona,
                interaction_type=interaction_type or "general",
                owner_emotion=resolved_owner_emotion,
                voice_mode=voice_mode,
                audio_features=audio_features,
                visual_context=None,   # Phase 4
                session_duration=session_min,
                is_first_message=is_first,
                memories=memories,
                session_hint=session_hint,
                gap_hours=gap_hours,
            )

            # 스트리밍 (1st call)
            assistant_msg_id = str(uuid.uuid4())
            collected: list[str] = []
            start_ms = int(time.time() * 1000)

            try:
                async for token in llm_router.stream(
                    history,
                    ctx["system_prompt"],
                    ctx["use_think"],
                ):
                    collected.append(token)
                    if not voice_mode:
                        yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
            except Exception as exc:
                logger.error("/chat LLM error: cid=%s error=%s", cid, exc)
                yield (
                    f"data: {json.dumps({'type': 'error', 'code': 'LLM_UNAVAILABLE', 'message': str(exc)}, ensure_ascii=False)}\n\n"
                )
                return

            elapsed_ms = int(time.time() * 1000) - start_ms
            full_text = "".join(collected)

            # 음성 모드: 후처리 후 단일 토큰 전송
            if voice_mode:
                full_text = postprocess_for_voice(full_text)
                yield f"data: {json.dumps({'type': 'token', 'content': full_text}, ensure_ascii=False)}\n\n"

            # 어시스턴트 메시지 저장 (mood는 백그라운드에서 확정 후 UPDATE)
            await _save_message(
                db,
                assistant_msg_id,
                cid,
                "assistant",
                full_text,
                mood=None,
                response_time_ms=elapsed_ms,
                interaction_type=interaction_type,
            )

            # "PENDING": 백그라운드가 emotion_update SSE로 최종 무드 전달
            done_event = {
                "type":            "done",
                "message_id":      assistant_msg_id,
                "conversation_id": cid,
                "mood":            "PENDING",
            }
            yield f"data: {json.dumps(done_event, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

            logger.info(
                "/chat response complete: cid=%s elapsed_ms=%d think=%s voice=%s",
                cid, elapsed_ms, ctx["use_think"], voice_mode,
            )

            # 백그라운드 처리 등록
            background_tasks.add_task(
                _background_process,
                full_response=full_text,
                original_message=message,
                conversation_id=cid,
                assistant_msg_id=assistant_msg_id,
                elapsed_ms=elapsed_ms,
                audio_features=audio_features,
                owner_emotion=resolved_owner_emotion,
                interaction_type=interaction_type,
                timestamp=datetime.now(timezone.utc).isoformat(),
                session_duration=session_min,
                ctx=ctx,
                memories=memories,
            )

    return StreamingResponse(event_stream(), media_type="text/event-stream")
