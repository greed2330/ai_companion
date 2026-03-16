"""
Celery 기본 설정.
Phase 2에서 태스크를 추가한다. 지금은 뼈대만.
"""

import os

from celery import Celery

REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "hana",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "backend.tasks.memory_tasks",
        "backend.tasks.score_tasks",
        "backend.tasks.diary_tasks",
        "backend.tasks.alert_tasks",
        "backend.tasks.decay_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Seoul",
    enable_utc=True,
)
