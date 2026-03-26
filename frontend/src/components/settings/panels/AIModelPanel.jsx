import { useState } from "react";
import PropTypes from "prop-types";
import ChipGroup from "../../common/ChipGroup";
import Badge from "../../common/Badge";
import { buildApiUrl } from "../../../services/api";

const SPEECH_OPTIONS = [
  "bright_friend",
  "cheerful_girl",
  "tsundere",
  "calm_sister",
  "playful",
  "custom",
];

const SPEECH_LABELS = [
  "밝은 친구",
  "해맑은 소녀",
  "츤데레",
  "차분한 누나",
  "장난꾸러기",
  "직접 입력",
];

function AIModelPanel({ settings }) {
  const {
    current,
    llmModels,
    currentLlmModelId,
    previewPersona,
    previewSamples,
    selectLlmModel,
    updatePending,
  } = settings;
  const [testResult, setTestResult] = useState(null);

  async function handlePreview() {
    await previewPersona();
  }

  async function handleTest() {
    try {
      const response = await fetch(buildApiUrl("/settings/llm/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "ollama" }),
      });
      const payload = await response.json();
      setTestResult(payload.success ? "ok" : "warn");
    } catch {
      setTestResult("warn");
    }

    window.setTimeout(() => setTestResult(null), 3000);
  }

  return (
    <>
      <div className="panel-section">
        <div className="panel-title">AI 이름과 호칭</div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">AI 이름</div>
          </div>
          <input
            className="hana-input"
            value={current.persona.ai_name}
            onChange={(event) =>
              updatePending("persona", { ...current.persona, ai_name: event.target.value })
            }
          />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">오너 호칭</div>
          </div>
          <input
            className="hana-input"
            value={current.persona.owner_nickname}
            onChange={(event) =>
              updatePending("persona", {
                ...current.persona,
                owner_nickname: event.target.value,
              })
            }
          />
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">말투 프리셋</div>
        <ChipGroup
          options={SPEECH_OPTIONS}
          labels={SPEECH_LABELS}
          value={current.persona.speech_preset}
          onChange={(value) =>
            updatePending("persona", { ...current.persona, speech_preset: value })
          }
        />
        {current.persona.speech_preset === "custom" ? (
          <input
            className="hana-input"
            placeholder="말투를 직접 입력해줘..."
            value={current.persona.speech_style}
            onChange={(event) =>
              updatePending("persona", {
                ...current.persona,
                speech_style: event.target.value,
              })
            }
          />
        ) : null}
        <div className="btn-row">
          <button className="btn btn-ghost btn-sm" type="button" onClick={handlePreview}>
            미리보기 (3개 샘플)
          </button>
        </div>
        {previewSamples.length ? (
          <div className="preview-samples">
            {previewSamples.map((sample) => (
              <div key={sample} className="preview-sample">
                {sample}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="panel-section">
        <div className="panel-title">LLM 설정</div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">LLM Provider</div>
          </div>
          <select className="hana-select" defaultValue="ollama">
            <option value="ollama">Ollama (로컬)</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">채팅 모델</div>
          </div>
          <select
            className="hana-select"
            value={currentLlmModelId}
            onChange={(event) => selectLlmModel(event.target.value)}
          >
            {llmModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}
              </option>
            ))}
          </select>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost btn-sm" type="button" onClick={handleTest}>
            연결 테스트
          </button>
          {testResult === "ok" ? <Badge tone="badge-ok">정상</Badge> : null}
          {testResult === "warn" ? <Badge tone="badge-warn">실패</Badge> : null}
        </div>
      </div>
    </>
  );
}

AIModelPanel.propTypes = {
  settings: PropTypes.object.isRequired,
};

export default AIModelPanel;
