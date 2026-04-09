import PropTypes from "prop-types";
import ChipGroup from "../../common/ChipGroup";
import Toggle from "../../common/Toggle";
import { applyTheme } from "../../../hooks/useSettings";

function AppPanel({ settings }) {
  const { current, updatePending } = settings;

  return (
    <>
      <div className="panel-section">
        <div className="panel-title">테마</div>
        <ChipGroup
          options={["dark-anime", "glass", "minimal"]}
          labels={["다크 애니", "글래스", "미니멀"]}
          value={current.theme}
          onChange={(value) => {
            updatePending("theme", value);
            applyTheme(value);
          }}
        />
      </div>

      <div className="panel-section">
        <div className="panel-title">앱 설정</div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">단축키</div>
          </div>
          <div className="integration-actions">
            <span className="shortcut-key">Alt+H</span>
            <button className="btn btn-ghost btn-sm is-disabled" type="button" disabled>
              변경
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">자동 실행</div>
          </div>
          <Toggle
            on={current.autoLaunch}
            onChange={(value) => updatePending("autoLaunch", value)}
          />
        </div>
      </div>
    </>
  );
}

AppPanel.propTypes = {
  settings: PropTypes.object.isRequired,
};

export default AppPanel;
