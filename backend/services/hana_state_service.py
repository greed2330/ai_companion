"""
hana_state 싱글턴 CRUD.
모든 상태 읽기/쓰기는 여기를 통한다.
"""

import aiosqlite
from backend.models.schema import DB_PATH


async def get_state() -> dict:
    """hana_state 싱글턴 행을 딕트로 반환한다. 없으면 빈 딕트."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM hana_state WHERE id='singleton'"
        ) as cursor:
            row = await cursor.fetchone()
    return dict(row) if row else {}


async def update_state(**kwargs: object) -> None:
    """변경할 필드만 전달. id는 제외."""
    if not kwargs:
        return
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            f"UPDATE hana_state SET {sets} WHERE id='singleton'",
            list(kwargs.values()),
        )
        await db.commit()
