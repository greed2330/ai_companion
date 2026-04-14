"""
TTS 엔진 추상화 Protocol.

새 TTS 엔진 추가 시 이 파일의 TTSEngine을 구현하면 됨.
TTSRouter가 엔진 교체를 처리하므로 voice_output.py는 수정 불필요.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable


@dataclass
class VoiceInfo:
    """단일 TTS 목소리 메타데이터."""
    id: str                       # 엔진 내부 식별자 (예: "ko-KR-SunHiNeural")
    name: str                     # 사용자 표시 이름 (예: "SunHi (한국어)")
    language: str                 # BCP-47 언어 코드 (예: "ko-KR")
    engine_id: str                # 소속 엔진 ID (예: "edge_tts")
    preview_text: str = "안녕! 나는 하나야. 잘 부탁해~"
    is_custom: bool = False       # True = 사용자 업로드 커스텀 목소리


@dataclass
class EngineInfo:
    """TTS 엔진 메타데이터."""
    id: str                             # 엔진 고유 ID (예: "edge_tts")
    name: str                           # 사용자 표시 이름 (예: "Edge TTS")
    description: str                    # 한 줄 설명
    requires_internet: bool             # 인터넷 연결 필요 여부
    supports_custom_voices: bool        # 커스텀 목소리 업로드 지원 여부
    voices: list[VoiceInfo] = field(default_factory=list)


@runtime_checkable
class TTSEngine(Protocol):
    """
    TTS 엔진 인터페이스.

    구현 규칙:
    - synthesize()는 반드시 MP3 바이트를 반환할 것.
    - list_voices()는 빈 리스트보다 최소 1개 이상 반환할 것 (엔진 사용 가능 상태라면).
    - 엔진 초기화 실패 시 synthesize() 호출 시점에 예외를 올릴 것.
    """

    @property
    def engine_info(self) -> EngineInfo:
        """엔진 메타데이터를 반환한다."""
        ...

    async def is_available(self) -> bool:
        """엔진이 현재 사용 가능한지 확인한다."""
        ...

    async def list_voices(self) -> list[VoiceInfo]:
        """사용 가능한 목소리 목록을 반환한다."""
        ...

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        pitch: float = 1.0,
    ) -> bytes:
        """
        텍스트를 MP3 바이트로 변환한다.

        Parameters
        ----------
        text     : 합성할 텍스트
        voice_id : list_voices()에서 반환된 VoiceInfo.id
        speed    : 속도 배율 (1.0 = 기본)
        pitch    : 피치 배율 (1.0 = 기본)

        Returns
        -------
        MP3 바이너리 bytes
        """
        ...
