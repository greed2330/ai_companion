"""
Celery 설정 및 beat 스케줄.
"""

import os

from celery import Celery
from celery.schedules import crontab

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
    beat_schedule={
        # 매일 자정 망각 곡선 decay 실행
        "daily-confidence-decay": {
            "task": "decay_tasks.run_confidence_decay",
            "schedule": crontab(hour=0, minute=0),
        },
        # 매일 새벽 1시 단기 기억 압축 (7일 이상 된 volatile → longterm 이관)
        "daily-volatile-compress": {
            "task": "decay_tasks.compress_volatile_memories",
            "schedule": crontab(hour=1, minute=0),
        },
    },
)
