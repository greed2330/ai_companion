"""
무드 스트림 라우터.
GET /mood/stream — 무드 변경 실시간 SSE 푸시
"""

import asyncio
import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.services.mood import get_mood, subscribe, unsubscribe

logger = logging.getLogger(__name__)

router = APIRouter()

# heartbeat 간격 (초)
_HEARTBEAT_INTERVAL = 30


@router.get("/mood/stream")
async def mood_stream() -> StreamingResponse:
    """무드 변경 이벤트를 SSE로 스트리밍한다.
    연결이 유지되는 동안 무드가 바뀔 때마다 push하고
    30초마다 heartbeat comment를 전송해 연결을 유지한다.
    """
    q = subscribe()
    logger.info("mood/stream: client connected")

    async def event_stream():
        try:
            # 초기 현재 무드 즉시 전송
            current = get_mood()
            initial = {"type": "mood_change", "mood": current["mood"], "updated_at": current["updated_at"]}
            yield f"data: {json.dumps(initial, ensure_ascii=False)}\n\n"

            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=_HEARTBEAT_INTERVAL)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    # heartbeat — 연결 유지용 빈 comment
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe(q)
            logger.info("mood/stream: client disconnected")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx 버퍼링 비활성화 — SSE 드롭 방지
        },
    )
