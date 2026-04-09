"""
STT 엔진 추상화 Protocol.

새 STT 엔진 추가 시 이 파일의 STTEngine을 구현하면 됨.
STTRouter(또는 voice_input.py)가 위임을 처리하므로 routers/voice.py는 수정 불필요.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass
class TranscribeResult:
    """STT 변환 결과."""
    text: str
    confidence: float   # 0.0 ~ 1.0
    language: str       # 감지된 언어 코드 (예: "ko")


@runtime_checkable
class STTEngine(Protocol):
    """
    STT 엔진 인터페이스.

    구현 규칙:
    - transcribe()는 반드시 TranscribeResult를 반환할 것.
    - 오디오가 비어 있거나 인식 실패 시 text=""로 반환 (예외 아님).
    - 엔진 로드 실패는 최초 transcribe() 호출 시 예외로 올릴 것.
    """

    async def transcribe(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/wav",
    ) -> TranscribeResult:
        """
        오디오 바이트를 텍스트로 변환한다.

        Parameters
        ----------
        audio_bytes : WAV/WebM 등 오디오 파일 바이트
        mime_type   : MIME 타입 (파일 형식 판별용)

        Returns
        -------
        TranscribeResult (text, confidence, language)
        """
        ...
