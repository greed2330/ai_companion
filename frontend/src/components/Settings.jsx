import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import {
  fetchLlmModels,
  fetchModels,
  selectLlmModel,
  selectModel
} from "../services/settings";

function getCharacterTypeLabel(model) {
  if (model.type === "live2d" || model.path?.endsWith(".model3.json")) {
    return "Live2D";
  }

  if (model.type === "pmx" || model.path?.endsWith(".pmx")) {
    return "PMX";
  }

  return "Unknown";
}

function getLlmRoleLabel(role) {
  if (role === "chat") {
    return "Chat";
  }

  if (role === "worker") {
    return "Worker";
  }

  if (role === "vision") {
    return "Vision";
  }

  return role;
}

function Settings({ onModelSelected = () => {} }) {
  const [characterModels, setCharacterModels] = useState([]);
  const [currentCharacterModel, setCurrentCharacterModel] = useState(null);
  const [llmModels, setLlmModels] = useState([]);
  const [currentChatModel, setCurrentChatModel] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const [characterPayload, llmPayload] = await Promise.all([
          fetchModels(),
          fetchLlmModels()
        ]);

        setCharacterModels(characterPayload.models || []);
        setCurrentCharacterModel(characterPayload.current || null);
        setLlmModels(llmPayload.models || []);
        setCurrentChatModel(llmPayload.current_chat_model || null);
      } catch (loadError) {
        setError(loadError.message);
      }
    }

    loadSettings();
  }, []);

  async function handleCharacterSelect(modelId) {
    try {
      const payload = await selectModel(modelId);
      setCurrentCharacterModel(payload.current);
      const channel = new BroadcastChannel("hana-overlay");
      channel.postMessage({
        type: "character_model_selected",
        modelId: payload.current
      });
      channel.close();
      onModelSelected(payload.current);
    } catch (selectError) {
      setError(selectError.message);
    }
  }

  async function handleLlmSelect(modelId) {
    try {
      const payload = await selectLlmModel(modelId);
      setCurrentChatModel(payload.current_chat_model);
    } catch (selectError) {
      setError(selectError.message);
    }
  }

  function handleMinimize() {
    window.hanaDesktop?.minimizeWindow?.();
  }

  function handleMaximizeToggle() {
    window.hanaDesktop?.toggleMaximizeWindow?.();
  }

  function handleClose() {
    window.hanaDesktop?.closeWindow?.();
  }

  return (
    <section className="settings-panel">
      <header className="settings-panel__header">
        <div className="window-title">
          <h1>Model Settings</h1>
          <p>Chat hotkey: Alt+H</p>
        </div>
        <div className="window-controls">
          <button
            type="button"
            className="window-control-button"
            aria-label="Minimize window"
            onClick={handleMinimize}
          >
            _
          </button>
          <button
            type="button"
            className="window-control-button"
            aria-label="Maximize window"
            onClick={handleMaximizeToggle}
          >
            []
          </button>
          <button
            type="button"
            className="window-control-button window-control-button--danger"
            aria-label="Close window"
            onClick={handleClose}
          >
            X
          </button>
        </div>
      </header>

      <section className="settings-section">
        <div className="settings-section__header">
          <div>
            <h2>Character Models</h2>
            <p>Switch between Live2D and PMX character models.</p>
          </div>
        </div>
        <div className="settings-model-list">
          {characterModels.map((model) => (
            <button
              key={model.id}
              type="button"
              className={`settings-model ${currentCharacterModel === model.id ? "is-active" : ""}`}
              onClick={() => handleCharacterSelect(model.id)}
            >
              <strong>{model.name}</strong>
              <span>{getCharacterTypeLabel(model)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__header">
          <div>
            <h2>AI Models</h2>
            <p>Only the main chat model can be changed here. Worker and vision stay fixed.</p>
          </div>
        </div>
        <div className="settings-model-list">
          {llmModels.map((model) => {
            const disabled = model.role !== "chat";
            return (
              <button
                key={model.id}
                type="button"
                className={`settings-model ${currentChatModel === model.id ? "is-active" : ""}`}
                onClick={() => handleLlmSelect(model.id)}
                disabled={disabled}
              >
                <strong>{model.name}</strong>
                <span>{getLlmRoleLabel(model.role)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

Settings.propTypes = {
  onModelSelected: PropTypes.func
};

export default Settings;
