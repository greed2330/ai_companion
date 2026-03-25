import { useEffect } from "react";
import PropTypes from "prop-types";
import Toggle from "../../common/Toggle";
import HanaSlider from "../../common/HanaSlider";

function CharacterPanel({ settings }) {
  const { current, currentModelId, models, selectCharacterModel, updatePending } = settings;
  const viewportSize = current.viewportSize ?? 100;
  const viewportOpacity = current.viewportOpacity ?? 85;

  useEffect(() => {
    window.hanaDesktop?.charViewportSize?.(viewportSize);
    window.hanaDesktop?.charViewportOpacity?.(viewportOpacity);
  }, [viewportOpacity, viewportSize]);

  return (
    <>
      <div className="panel-section">
        <div className="panel-title">캐릭터 모델</div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">현재 모델</div>
            <div className="setting-desc">Live2D / PMX</div>
          </div>
          <select
            className="hana-select"
            value={currentModelId}
            onChange={(event) => selectCharacterModel(event.target.value)}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.type})
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">화면 주시</div>
            <div className="setting-desc">OCR 및 화면 반응</div>
          </div>
          <Toggle
            on={current.autonomous.screen_reaction}
            onChange={(value) =>
              updatePending("autonomous", {
                ...current.autonomous,
                screen_reaction: value,
              })
            }
          />
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">뷰포트 설정</div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">크기</div>
          </div>
          <div className="slider-row">
            <HanaSlider
              min={50}
              max={200}
              value={viewportSize}
              onChange={(value) => updatePending("viewportSize", value)}
            />
            <span className="slider-val">{viewportSize}%</span>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">불투명도</div>
          </div>
          <div className="slider-row">
            <HanaSlider
              min={20}
              max={100}
              value={viewportOpacity}
              onChange={(value) => updatePending("viewportOpacity", value)}
            />
            <span className="slider-val">{viewportOpacity}%</span>
          </div>
        </div>

        <div className="btn-row">
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => window.hanaDesktop?.openCharPositionPopup?.()}
          >
            캐릭터 위치 조정...
          </button>
        </div>
      </div>
    </>
  );
}

CharacterPanel.propTypes = {
  settings: PropTypes.object.isRequired,
};

export default CharacterPanel;
