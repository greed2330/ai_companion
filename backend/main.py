"""
HANA 백엔드 FastAPI 서버.
포트 8000. CORS: http://localhost:3000
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.models.schema import init_db
from backend.routers.chat import router as chat_router
from backend.routers.memory import router as memory_router
from backend.routers.mood import router as mood_router
from backend.routers.proactive import router as proactive_router
from backend.routers.settings import router as settings_router
from backend.routers.voice import router as voice_router
from backend.services.model_context_service import load_cached_context


def _setup_logging() -> None:
    """로그 파일과 콘솔 핸들러를 설정한다."""
    os.makedirs("logs", exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        handlers=[
            logging.FileHandler("logs/hana.log"),
            logging.StreamHandler(),
        ],
    )


_setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = logging.getLogger(__name__)
    logger.info("HANA backend starting up")
    os.makedirs("data", exist_ok=True)
    await init_db()
    logger.info("DB initialized")
    load_cached_context()
    # TTS 엔진 등록 및 설정 복원
    try:
        from backend.services.tts_edge import EdgeTTSEngine
        from backend.services.tts_router import tts_router
        tts_router.register(EdgeTTSEngine())
        tts_router.load_from_settings()
        logger.info("TTS router initialized")
    except Exception as e:
        logger.warning("TTS router init failed: %s", e)
    # SPEC-06: Tier1 무드 DB에서 복원
    try:
        from backend.services.mood import load_tier1_from_db
        await load_tier1_from_db()
        logger.info("Tier1 mood restored from DB")
    except Exception as e:
        logger.warning("Tier1 mood restore failed: %s", e)
    # ChromaDB 레거시 컬렉션 마이그레이션 (기존 hana_memory → hana_memory_longterm)
    try:
        from backend.services.memory_service import migrate_legacy_collection
        migrated = migrate_legacy_collection()
        if migrated:
            logger.info("Legacy memory migrated: count=%d", migrated)
    except Exception as e:
        logger.warning("Legacy memory migration skipped: %s", e)
    yield
    logger.info("HANA backend shutting down")


app = FastAPI(title="HANA Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(memory_router)
app.include_router(mood_router)
app.include_router(proactive_router)
app.include_router(settings_router)
app.include_router(voice_router)
