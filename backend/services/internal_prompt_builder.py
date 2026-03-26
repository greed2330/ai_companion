"""
내부 상태 프롬프트 빌더.
2nd LLM call에서 하나의 내면 독백 JSON을 생성하기 위한 프롬프트를 만든다.
"""

from typing import Optional


def build_internal_state_prompt(
    original_message: str,
    full_response: str,
    parsed_emotion: str,
    audio_features: Optional[dict] = None,
    timestamp: str = "",
    session_duration: int = 0,
) -> str:
    """
    2nd call용 시스템 프롬프트를 반환한다.
    결과는 JSON만 포함해야 한다.
    """
    audio_summary = "unknown"
    if audio_features:
        e = audio_features.get("energy", 1.0)
        if e < 0.4:
            audio_summary = "low energy"
        elif e > 0.8:
            audio_summary = "energetic"
        else:
            audio_summary = "normal"

    return (
        "You are HANA's internal monologue generator.\n"
        f'Owner said: "{original_message}"\n'
        f"Voice state: {audio_summary} | Session: {session_duration}min | Time: {timestamp}\n"
        f'HANA responded: "{full_response}"\n'
        f"HANA's emotion: {parsed_emotion}\n\n"
        "Reply with ONLY this JSON (no markdown, no extra text):\n"
        '{"thought": "1-2 sentences of what HANA was thinking", '
        '"choice_reason": "why HANA chose this response in 1 sentence", '
        '"conflict": null, "certainty": 0.0}'
    )
