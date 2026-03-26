import { useState } from "react";
import SettingsNav from "./SettingsNav";
import CharacterPanel from "./panels/CharacterPanel";
import AIModelPanel from "./panels/AIModelPanel";
import BehaviorPanel from "./panels/BehaviorPanel";
import IntegrationsPanel from "./panels/IntegrationsPanel";
import VoicePanel from "./panels/VoicePanel";
import AppPanel from "./panels/AppPanel";
import useSettings from "../../hooks/useSettings";

function SettingsLayout() {
  const [activePanel, setActivePanel] = useState("character");
  const settings = useSettings();

  return (
    <div className="settings-layout" data-testid="settings-panel">
      <SettingsNav active={activePanel} onChange={setActivePanel} />
      <div className="settings-panel">
        {activePanel === "character" ? <CharacterPanel settings={settings} /> : null}
        {activePanel === "ai" ? <AIModelPanel settings={settings} /> : null}
        {activePanel === "behavior" ? <BehaviorPanel settings={settings} /> : null}
        {activePanel === "integrations" ? <IntegrationsPanel settings={settings} /> : null}
        {activePanel === "voice" ? <VoicePanel settings={settings} /> : null}
        {activePanel === "app" ? <AppPanel settings={settings} /> : null}
      </div>
      <div className="bottom-bar">
        <button className="btn btn-danger btn-sm" type="button" onClick={settings.handleReset}>
          초기화
        </button>
        <div className="bottom-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={settings.handleCancel}>
            취소
          </button>
          <button className="btn btn-primary btn-sm" type="button" onClick={settings.handleSave}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsLayout;
