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
from backend.routers.settings import router as settings_router


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
    await init_db()
    logger.info("DB initialized")
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
app.include_router(settings_router)
