"""
VRAM 스케줄러 (스텁).
Phase 4에서 실제 구현. 지금은 구조만 잡는다.

Desktop (RTX 4070 Ti Super 16GB):
  qwen3:14b(~10GB) + nomic-embed(~1GB) = 상시 상주
  qwen3-vl:8b(~6GB) = OCR 요청 시 on-demand

Apple Silicon: unified memory → VRAM 제한 없음.
"""

import logging
import platform

logger = logging.getLogger(__name__)


def is_apple_silicon() -> bool:
    return platform.system() == "Darwin" and platform.machine() == "arm64"


async def set_keep_alive(model: str, seconds: int) -> None:
    """Ollama keep_alive을 변경한다 (Phase 4 구현 예정)."""
    # TODO: Phase 4 — POST /api/chat {"model": model, "keep_alive": seconds}
    logger.debug("model_scheduler: set_keep_alive model=%s seconds=%d (stub)", model, seconds)


async def prepare_for_ocr() -> None:
    """OCR 실행 전 qwen3:14b keep_alive를 줄여 VRAM 확보."""
    if is_apple_silicon():
        return  # unified memory, VRAM 제한 없음
    await set_keep_alive("qwen3:14b", 5)


async def restore_after_ocr() -> None:
    """OCR 완료 후 qwen3:14b keep_alive를 복원한다."""
    if is_apple_silicon():
        return
    await set_keep_alive("qwen3:14b", -1)
