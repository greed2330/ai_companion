"""
메모리 백엔드 추상화 Protocol.

현재 구현: mem0 + ChromaDB + SQLite (memory.py, memory_service.py)
교체 대비: ChromaDB 말고 다른 벡터 DB 쓰고 싶을 때 이 Protocol만 구현하면 됨.

⚠️ 현재 이 Protocol을 직접 사용하는 코드는 없음.
   SPEC-02 (메모리 검색 단일화) 이후 memory.py/memory_service.py가
   이 인터페이스를 따르도록 리팩토링 예정.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class MemoryBackend(Protocol):
    """
    장기 메모리 백엔드 인터페이스.

    구현 규칙:
    - add()는 중복 사실을 병합할 것 (upsert 방식).
    - search()는 시맨틱 유사도 기반으로 반환할 것.
    - confidence 0.1 이하인 사실은 search() 결과에서 제외할 것.
    """

    async def add(
        self,
        user_id: str,
        message: str,
        source_message_id: str | None = None,
    ) -> list[dict]:
        """
        대화 내용에서 사실을 추출해 저장한다.

        Returns
        -------
        저장/업데이트된 사실 목록: [{"id": str, "fact": str}, ...]
        """
        ...

    async def search(
        self,
        user_id: str,
        query: str,
        limit: int = 5,
    ) -> list[dict]:
        """
        쿼리와 관련된 기억을 시맨틱 검색으로 반환한다.

        Returns
        -------
        [{"id": str, "fact": str, "confidence": float}, ...]
        """
        ...

    async def update_confidence(self, fact_id: str, delta: float) -> None:
        """
        사실의 confidence를 delta만큼 조정한다.
        참조 시 상승(+), 오래 안 쓰이면 decay(-).
        """
        ...

    async def delete(self, fact_id: str) -> None:
        """사실을 영구 삭제한다."""
        ...
