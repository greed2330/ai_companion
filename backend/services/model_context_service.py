"""
캐릭터 모델 컨텍스트 서비스.
선택된 모델의 파라미터 범위를 추출하고 LLM이 motion_sequence를 생성할 때
사용할 컨텍스트 문자열을 만든다.
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# 추상 이름 → 모델 파라미터 이름 매핑 키워드
_ABSTRACT_KEYWORDS: dict[str, list[str]] = {
    "head_x":    ["AngleX", "HeadX", "頭X"],
    "head_y":    ["AngleY", "HeadY", "頭Y"],
    "head_z":    ["AngleZ", "HeadZ", "頭Z"],
    "eye_open":  ["EyeLOpen", "EyeOpen", "目開"],
    "smile":     ["MouthForm", "笑い", "smile"],
    "mouth_open":["MouthOpenY", "あ", "MouthOpen"],
    "gaze_x":    ["EyeBallX", "視線X"],
    "gaze_y":    ["EyeBallY", "視線Y"],
    "sweat":     ["冷や汗", "sweat"],
    "blush":     ["赤面", "blush"],
}

# 런타임 캐시
_ctx: dict = {}


def _map_abstract(raw_params: dict) -> dict:
    """파라미터 이름을 추상 이름으로 매핑한다."""
    mapping: dict = {}
    for abstract, keywords in _ABSTRACT_KEYWORDS.items():
        for name in raw_params:
            if any(k.lower() in name.lower() for k in keywords):
                mapping[abstract] = name
                break
    return mapping


def _extract_live2d_params(path: str) -> dict:
    """Live2D .model3.json에서 파라미터 범위를 추출한다."""
    try:
        model_path = Path(path)
        # .model3.json 자체가 아닌 model3.json이 참조하는 physics/motion 파일들은 무시
        # Parameters는 .model3.json에 직접 없을 수 있으므로 같은 폴더의 *.moc3 에서는 못 읽음
        # 대신 .model3.json의 Groups나 Parameters 섹션을 시도
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        params = {}
        for p in data.get("Parameters", []):
            params[p["Id"]] = {
                "min":     p.get("Minimum", -1.0),
                "max":     p.get("Maximum", 1.0),
                "default": p.get("Default", 0.0),
            }
        return params
    except Exception as e:
        logger.debug("live2d 파라미터 추출 실패: %s", e)
        return {}


def _extract_pmx_params(path: str) -> dict:
    """PMX 파일에서 모프 목록을 추출한다."""
    try:
        import pmx  # type: ignore[import]
        m = pmx.load(path)
        return {
            mo.name: {"min": 0.0, "max": 1.0, "default": 0.0}
            for mo in m.morphs
        }
    except Exception as e:
        logger.debug("pmx 파라미터 추출 실패: %s", e)
        return {}


def _build_llm_context(
    model_type: str, mapping: dict, ranges: dict
) -> str:
    lines = [
        f"Current character model: {model_type}",
        "",
        "Available expression params:",
    ]
    for abstract, actual in mapping.items():
        r = ranges.get(actual, {})
        lines.append(
            f"- {abstract}: {r.get('min', 0)} ~ {r.get('max', 1)} "
            f"(default: {r.get('default', 0)})"
        )
    lines += [
        "",
        "motion_sequence rules:",
        "- Use 'abstract' field names above",
        "- value within range",
        "- duration in ms (200-1000)",
        "- easing: linear|ease_in|ease_out|ease_in_out|bounce",
    ]
    return "\n".join(lines)


async def on_model_changed(
    model_id: str,
    model_path: str,
    model_type: str,
) -> dict:
    """
    캐릭터 모델이 변경될 때 호출된다.
    파라미터를 추출하고 data/model_context.json에 저장한다.
    """
    global _ctx
    if model_type == "live2d":
        raw = _extract_live2d_params(model_path)
    else:
        raw = _extract_pmx_params(model_path)

    mapping = _map_abstract(raw)
    _ctx = {
        "model_id":       model_id,
        "model_type":     model_type,
        "abstract_mapping": mapping,
        "param_ranges":   raw,
        "llm_context":    _build_llm_context(model_type, mapping, raw),
    }

    os.makedirs("data", exist_ok=True)
    try:
        with open("data/model_context.json", "w", encoding="utf-8") as f:
            json.dump(_ctx, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("model_context.json 저장 실패: %s", e)

    logger.info(
        "model_context: model_id=%s type=%s params=%d",
        model_id, model_type, len(raw),
    )
    return _ctx


def get_current_context() -> dict:
    return _ctx


def get_model_llm_context() -> str:
    return _ctx.get("llm_context", "")


def load_cached_context() -> None:
    """서버 시작 시 data/model_context.json을 불러온다."""
    global _ctx
    try:
        with open("data/model_context.json", encoding="utf-8") as f:
            _ctx = json.load(f)
        logger.info("model_context: loaded from cache, model_id=%s", _ctx.get("model_id"))
    except (FileNotFoundError, json.JSONDecodeError):
        pass
