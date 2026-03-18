import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { detectModelType } from "./CharacterOverlay";
import { fetchModels, selectModel } from "../services/settings";

function Settings({ onModelSelected = () => {} }) {
  const [models, setModels] = useState([]);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadModels() {
      try {
        const payload = await fetchModels();
        setModels(payload.models || []);
        setCurrent(payload.current || null);
      } catch (loadError) {
        setError(loadError.message);
      }
    }

    loadModels();
  }, []);

  async function handleSelect(modelId) {
    try {
      const payload = await selectModel(modelId);
      setCurrent(payload.current);
      onModelSelected(payload.current);
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
      <div className="settings-model-list">
        {models.map((model) => {
          const type = detectModelType(model.path);
          const label = type === "live2d" ? "Live2D" : "PMX";
          return (
            <button
              key={model.id}
              type="button"
              className={`settings-model ${current === model.id ? "is-active" : ""}`}
              onClick={() => handleSelect(model.id)}
            >
              <strong>{model.name}</strong>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

Settings.propTypes = {
  onModelSelected: PropTypes.func
};

export default Settings;
