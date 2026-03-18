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

  return (
    <section className="settings-panel">
      <header className="settings-panel__header">
        <div>
          <h1>모델 설정</h1>
          <p>채팅 핫키: Alt+H</p>
        </div>
      </header>

      <section className="settings-section">
        <div className="settings-section__header">
          <div>
            <h2>캐릭터 모델</h2>
            <p>Live2D와 PMX 모델을 여기서 바꿀 수 있어.</p>
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
            <h2>AI 모델</h2>
            <p>메인 채팅 모델만 바꿀 수 있고 worker/vision은 고정이야.</p>
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
