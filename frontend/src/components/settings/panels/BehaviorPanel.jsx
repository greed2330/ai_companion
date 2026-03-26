import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import HierarchyCheckbox from "../../common/HierarchyCheckbox";
import HanaSlider from "../../common/HanaSlider";

function BehaviorPanel({ settings }) {
  const { current, updatePending } = settings;
  const [searchLimit, setSearchLimit] = useState(10);
  const serperConnected = false;

  const allState = useMemo(() => {
    const values = [
      current.autonomous.proactive_chat,
      current.autonomous.auto_crawl,
    ];

    if (values.every(Boolean)) {
      return "checked";
    }
    if (values.some(Boolean)) {
      return "indeterminate";
    }
    return "unchecked";
  }, [current.autonomous.auto_crawl, current.autonomous.proactive_chat]);

  function handleAllChange(nextState) {
    const enabled = nextState === "checked";
    updatePending("autonomous", {
      ...current.autonomous,
      proactive_chat: enabled,
      auto_crawl: enabled && serperConnected,
    });
  }

  return (
    <>
      <div className="panel-section">
        <div className="panel-title">자율 행동</div>
        <HierarchyCheckbox label="자율 행동 전체" checked={allState} onChange={handleAllChange}>
          <HierarchyCheckbox
            label="능동적 말 걸기"
            checked={current.autonomous.proactive_chat ? "checked" : "unchecked"}
            onChange={(value) =>
              updatePending("autonomous", {
                ...current.autonomous,
                proactive_chat: value === "checked",
              })
            }
          />
          <HierarchyCheckbox
            label="자율 검색"
            checked={current.autonomous.auto_crawl ? "checked" : "unchecked"}
            onChange={(value) =>
              updatePending("autonomous", {
                ...current.autonomous,
                auto_crawl: value === "checked",
              })
            }
            disabled={!serperConnected}
            warning={!serperConnected ? "Serper API 연결 필요" : null}
          />
          <HierarchyCheckbox
            label="작업 돕기"
            checked="unchecked"
            onChange={() => {}}
            disabled
            badge="Phase 4"
          />
        </HierarchyCheckbox>
      </div>

      <div className="panel-section">
        <div className="panel-title">검색 제한</div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">일일 검색 시도</div>
          </div>
          <div className="slider-row">
            <HanaSlider min={1} max={50} value={searchLimit} onChange={setSearchLimit} />
            <span className="slider-val">{searchLimit}회</span>
          </div>
        </div>
      </div>
    </>
  );
}

BehaviorPanel.propTypes = {
  settings: PropTypes.object.isRequired,
};

export default BehaviorPanel;
