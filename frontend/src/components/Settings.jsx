import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { OUTPUT_MODES } from "../constants/outputModes";
import { previewPersona } from "../services/settings";

const SECTIONS = [
  ["character", "Character", "Model and viewport"],
  ["ai", "AI & Persona", "Persona and LLM"],
  ["autonomous", "Autonomy", "Proactive behavior"],
  ["integrations", "Integrations", "API status"],
  ["voice", "Voice", "Input and output"],
  ["app", "App", "Theme and shortcut"],
];

const SPEECH_PRESETS = [
  ["bright_friend", "Bright friend"],
  ["cheerful_girl", "Cheerful"],
  ["tsundere", "Tsundere"],
  ["calm_noona", "Calm"],
  ["playful", "Playful"],
  ["custom", "Custom"],
];

const PERSONALITY_PRESETS = [
  ["energetic", "Energetic"],
  ["warm", "Warm"],
  ["sharp", "Sharp"],
  ["emotional", "Emotional"],
  ["playful", "Playful"],
  ["custom", "Custom"],
];

const INPUT_MODES = [
  ["text", "Text"],
  ["voice", "Voice"],
  ["both", "Hybrid"],
];

const OUTPUT_MODE_OPTIONS = [
  [OUTPUT_MODES.CHAT, "Chat", "Render the full reply in chat"],
  [OUTPUT_MODES.BUBBLE, "Bubble", "Short overlay bubble"],
  [OUTPUT_MODES.VOICE, "Voice", "TTS only"],
  [OUTPUT_MODES.BUBBLE_VOICE, "Bubble + Voice", "Bubble with TTS"],
];

const THEMES = [
  ["dark-anime", "Dark Anime", "Default desktop theme"],
  ["glass", "Glass", "Frosted treatment"],
  ["minimal", "Minimal", "Low-noise shell"],
];

const SNAP_POSITIONS = [
  [12, 12],
  [50, 12],
  [88, 12],
  [12, 50],
  [50, 50],
  [88, 50],
  [12, 88],
  [50, 88],
  [88, 88],
];

const SIZE_PRESETS = [
  ["S", 80],
  ["M", 100],
  ["L", 120],
  ["XL", 140],
];

function maskKey(key) {
  return key ? `${key.slice(0, 4)}...${key.slice(-4)}` : "";
}

function tone(status, transient) {
  if (transient === "fail") {
    return "red";
  }
  if (transient === "success") {
    return "connected";
  }
  if (transient === "loading") {
    return "yellow";
  }
  return status || "grey";
}

function statusLabel(status) {
  if (status === "connected") {
    return "Connected";
  }
  if (status === "yellow") {
    return "Checking";
  }
  if (status === "red") {
    return "Failed";
  }
  return "Not connected";
}

function Toggle({ checked, ariaLabel, onChange }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      className={`hana-toggle ${checked ? "is-on" : ""}`}
      onClick={onChange}
    >
      <span className="hana-toggle__thumb" />
    </button>
  );
}

Toggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

function ChoiceCards({ ariaLabel, items, value, onChange }) {
  return (
    <div className="choice-grid" aria-label={ariaLabel} role="list">
      {items.map(([itemValue, label, detail]) => (
        <button
          key={itemValue}
          type="button"
          className={`choice-card ${value === itemValue ? "is-active" : ""}`}
          onClick={() => onChange(itemValue)}
        >
          <strong>{label}</strong>
          {detail ? <span>{detail}</span> : null}
        </button>
      ))}
    </div>
  );
}

ChoiceCards.propTypes = {
  ariaLabel: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.array).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

function Settings({ settingsState }) {
  const {
    effective,
    error,
    handleCancel,
    handleConfirm,
    handleReset,
    handleThemeChange,
    meta,
    setError,
    setMeta,
    updatePending,
  } = settingsState;

  const [active, setActive] = useState("character");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [integrationUi, setIntegrationUi] = useState({});
  const [keyVisibility, setKeyVisibility] = useState({});

  const selectedModel = useMemo(
    () => meta.characterModels.find((model) => model.id === effective.character.modelId) || null,
    [effective.character.modelId, meta.characterModels]
  );
  const characterScale = effective.character.viewportScale ?? 100;
  const characterPositionX = effective.character.positionX ?? 50;
  const characterPositionY = effective.character.positionY ?? 50;
  const characterOpacity = effective.character.opacity ?? 85;
  const selectedModelName = selectedModel?.name || effective.character.modelId || "No model";
  const selectedModelType = (selectedModel?.type || effective.character.modelType || "model").toUpperCase();
  const serperOk = effective.integrations.serper.status === "connected";
  const activeSnap = SNAP_POSITIONS.findIndex(
    ([x, y]) => x === characterPositionX && y === characterPositionY
  );

  async function runPreview() {
    try {
      const payload = await previewPersona({
        speech_preset: effective.persona.speech_preset,
        personality_preset: effective.persona.personality_preset,
      });
      setMeta((current) => ({ ...current, previewSamples: payload.samples || [] }));
      setPreviewOpen(true);
    } catch (previewError) {
      setError(previewError.message);
    }
  }

  async function testIntegration(name) {
    setIntegrationUi((current) => ({
      ...current,
      [name]: { state: "loading", message: "Checking connection..." },
    }));

    try {
      const response = await fetch(`/settings/integrations/${name}/test`, { method: "POST" });
      const payload = await response.json();
      setIntegrationUi((current) => ({
        ...current,
        [name]: {
          state: payload.success ? "success" : "fail",
          message: payload.success
            ? `Connected in ${payload.response_ms}ms`
            : `Failed: ${payload.error || "No response"}`,
        },
      }));
    } catch {
      setIntegrationUi((current) => ({
        ...current,
        [name]: { state: "fail", message: "Server request failed" },
      }));
    }
  }

  function row(label, description, control) {
    return (
      <div className="setting-row">
        <div className="setting-row__info">
          <div className="setting-row__label">{label}</div>
          {description ? <div className="setting-row__desc">{description}</div> : null}
        </div>
        <div className="setting-row__control">{control}</div>
      </div>
    );
  }

  function renderCharacterPanel() {
    return (
      <>
        <div className="panel-section">
          <div className="panel-title">Character Model</div>
          {row(
            "Current model",
            meta.characterModels.length
              ? `${meta.characterModels.length} models detected`
              : "No models found under assets/character",
            meta.characterModels.length ? (
              <select
                aria-label="character-model-select"
                className="hana-select"
                value={effective.character.modelId}
                onChange={(event) => {
                  const model = meta.characterModels.find((item) => item.id === event.target.value);
                  updatePending("character", {
                    modelId: event.target.value,
                    modelType: model?.type || effective.character.modelType,
                  });
                }}
              >
                {meta.characterModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.type.toUpperCase()})
                  </option>
                ))}
              </select>
            ) : (
              <div className="settings-content__badge">EMPTY</div>
            )
          )}
          {row(
            "Model type",
            "Live2D / PMX",
            <div className="settings-content__badge">{selectedModelType}</div>
          )}
          {row(
            "Screen reaction",
            "OCR and error reaction hooks",
            <Toggle
              ariaLabel="screen-reaction-toggle"
              checked={effective.autonomous.screen_reaction}
              onChange={() =>
                updatePending("autonomous", {
                  screen_reaction: !effective.autonomous.screen_reaction,
                })
              }
            />
          )}
        </div>

        <div className="panel-section">
          <div className="panel-title">Viewport</div>
          {row(
            "Size",
            "",
            <div className="slider-row">
              <input
                aria-label="viewport-scale"
                className="hana-slider"
                min="50"
                max="150"
                type="range"
                value={characterScale}
                onChange={(event) =>
                  updatePending("character", {
                    viewportScale: Number(event.target.value),
                  })
                }
              />
              <span className="slider-val">{characterScale}%</span>
            </div>
          )}
          <div className="preset-row">
            {SIZE_PRESETS.map(([label, value]) => (
              <button
                key={value}
                type="button"
                className={`preset-chip ${characterScale === value ? "is-active" : ""}`}
                onClick={() => updatePending("character", { viewportScale: value })}
              >
                {label}
              </button>
            ))}
          </div>
          {row(
            "Opacity",
            "",
            <div className="slider-row">
              <input
                aria-label="character-opacity"
                className="hana-slider"
                min="20"
                max="100"
                type="range"
                value={characterOpacity}
                onChange={(event) =>
                  updatePending("character", { opacity: Number(event.target.value) })
                }
              />
              <span className="slider-val">{characterOpacity}%</span>
            </div>
          )}
        </div>

        <div className="panel-section">
          <div className="panel-title">Position Preview</div>
          <div className="position-preview">
            <div className="position-preview__stage">
              <div className="position-preview__grid" />
              <div
                className="position-preview__figure"
                style={{
                  left: `${characterPositionX}%`,
                  top: `${characterPositionY}%`,
                  opacity: characterOpacity / 100,
                  transform: `translate(-50%, -50%) scale(${characterScale / 100})`,
                }}
              >
                <div className="position-preview__head" />
                <div className="position-preview__body" />
              </div>
              <div
                className="position-preview__anchor"
                style={{
                  left: `${characterPositionX}%`,
                  top: `${characterPositionY}%`,
                }}
              />
              <div className="position-preview__label">{selectedModelName}</div>
            </div>

            <div className="snap-grid" aria-label="position presets">
              {SNAP_POSITIONS.map(([x, y], index) => (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  className={`snap-button ${activeSnap === index ? "is-active" : ""}`}
                  onClick={() => updatePending("character", { positionX: x, positionY: y })}
                >
                  <span />
                </button>
              ))}
            </div>

            <div className="position-sliders">
              <div className="position-slider">
                <label htmlFor="position-x">X</label>
                <input
                  id="position-x"
                  aria-label="position-x"
                  className="hana-slider"
                  min="0"
                  max="100"
                  type="range"
                  value={characterPositionX}
                  onChange={(event) =>
                    updatePending("character", { positionX: Number(event.target.value) })
                  }
                />
                <span>{characterPositionX}%</span>
              </div>
              <div className="position-slider">
                <label htmlFor="position-y">Y</label>
                <input
                  id="position-y"
                  aria-label="position-y"
                  className="hana-slider"
                  min="0"
                  max="100"
                  type="range"
                  value={characterPositionY}
                  onChange={(event) =>
                    updatePending("character", { positionY: Number(event.target.value) })
                  }
                />
                <span>{characterPositionY}%</span>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  function renderAiPanel() {
    return (
      <>
        <div className="panel-section">
          <div className="panel-title">AI Name & Identity</div>
          <div className="settings-form-grid">
            <label className="settings-field">
              <span>AI name</span>
              <input
                aria-label="ai-name"
                className="hana-input"
                value={effective.persona.ai_name}
                onChange={(event) => updatePending("persona", { ai_name: event.target.value })}
              />
            </label>
            <label className="settings-field">
              <span>Owner nickname</span>
              <input
                aria-label="owner-nickname"
                className="hana-input"
                value={effective.persona.owner_nickname}
                onChange={(event) =>
                  updatePending("persona", { owner_nickname: event.target.value })
                }
              />
            </label>
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-title">Speech Preset</div>
          <div className="preset-row">
            {SPEECH_PRESETS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`preset-chip ${effective.persona.speech_preset === value ? "is-active" : ""}`}
                onClick={() => updatePending("persona", { speech_preset: value })}
              >
                {label}
              </button>
            ))}
          </div>
          {effective.persona.speech_preset === "custom" ? (
            <input
              aria-label="speech-style"
              className="hana-input"
              value={effective.persona.speech_style}
              onChange={(event) => updatePending("persona", { speech_style: event.target.value })}
            />
          ) : null}
        </div>

        <div className="panel-section">
          <div className="panel-title">Personality Preset</div>
          <div className="preset-row">
            {PERSONALITY_PRESETS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`preset-chip ${effective.persona.personality_preset === value ? "is-active" : ""}`}
                onClick={() => updatePending("persona", { personality_preset: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="settings-field">
            <span>Interests</span>
            <input
              aria-label="interests"
              className="hana-input"
              placeholder="coding, game, music"
              value={effective.persona.interests}
              onChange={(event) => updatePending("persona", { interests: event.target.value })}
            />
          </label>
        </div>

        <div className="panel-section">
          <div className="panel-title">LLM Source</div>
          {row(
            "Chat model",
            "role=chat only",
            <select
              aria-label="chat-model-select"
              className="hana-select"
              value={effective.aiModel.chatModelId}
              onChange={(event) => updatePending("aiModel", { chatModelId: event.target.value })}
            >
              {meta.llmModels
                .filter((model) => model.role === "chat")
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.id}
                  </option>
                ))}
            </select>
          )}
          <div className="settings-inline-actions">
            <button type="button" className="button button--primary" onClick={runPreview}>
              Preview persona
            </button>
          </div>
        </div>
      </>
    );
  }

  function renderAutonomyPanel() {
    return (
      <>
        <div className="panel-section">
          <div className="panel-title">Autonomous Behavior</div>
          {row(
            "Proactive chat",
            "Hana starts first",
            <Toggle
              ariaLabel="proactive-chat-toggle"
              checked={effective.autonomous.proactive_chat}
              onChange={() =>
                updatePending("autonomous", {
                  proactive_chat: !effective.autonomous.proactive_chat,
                })
              }
            />
          )}
          {row(
            "Tip bubbles",
            "Desktop tips and short comments",
            <Toggle
              ariaLabel="tip-bubbles-toggle"
              checked={effective.autonomous.tip_bubbles}
              onChange={() =>
                updatePending("autonomous", {
                  tip_bubbles: !effective.autonomous.tip_bubbles,
                })
              }
            />
          )}
          {row(
            "Screen reaction",
            "Error / game / app context reaction",
            <Toggle
              ariaLabel="screen-reaction-toggle-secondary"
              checked={effective.autonomous.screen_reaction}
              onChange={() =>
                updatePending("autonomous", {
                  screen_reaction: !effective.autonomous.screen_reaction,
                })
              }
            />
          )}
          {row(
            "Schedule reminders",
            "Calendar-linked reminders",
            <Toggle
              ariaLabel="schedule-reminder-toggle"
              checked={effective.autonomous.schedule_reminder}
              onChange={() =>
                updatePending("autonomous", {
                  schedule_reminder: !effective.autonomous.schedule_reminder,
                })
              }
            />
          )}
          {row(
            "Auto crawl",
            serperOk
              ? "Store public web info for later RAG use"
              : "Serper connection required before enabling",
            <Toggle
              ariaLabel="auto-crawl-toggle"
              checked={effective.autonomous.auto_crawl}
              onChange={() =>
                updatePending("autonomous", {
                  auto_crawl: !effective.autonomous.auto_crawl,
                })
              }
            />
          )}
          {!serperOk ? (
            <p className="settings-note">Serper API connection is required for background search.</p>
          ) : null}
          <div className="settings-slider-block">
            <label htmlFor="search-limit">
              Search limit <strong>{effective.autonomous.search_limit}/day</strong>
            </label>
            <input
              id="search-limit"
              aria-label="search-limit"
              className="hana-slider"
              min="1"
              max="30"
              type="range"
              value={effective.autonomous.search_limit}
              onChange={(event) =>
                updatePending("autonomous", { search_limit: Number(event.target.value) })
              }
            />
          </div>
        </div>
      </>
    );
  }

  function renderIntegrationsPanel() {
    return (
      <>
        {Object.entries(effective.integrations).map(([name, config]) => {
          const displayName =
            name === "google_calendar"
              ? "Google Calendar"
              : name === "serper"
                ? "Serper API"
                : "GitHub";
          const currentTone = tone(config.status, integrationUi[name]?.state);

          return (
            <div key={name} className="panel-section">
              <div className="panel-title">{displayName}</div>
              <div className="integration-row">
                <div className="setting-row__info">
                  <div className="setting-row__label">{displayName}</div>
                  <div className="setting-row__desc">
                    {integrationUi[name]?.message || statusLabel(config.status)}
                  </div>
                </div>
                <div className={`settings-status-pill settings-status-pill--${currentTone}`}>
                  <span className={`settings-badge-dot settings-badge-dot--${currentTone}`} />
                  <span>{statusLabel(currentTone)}</span>
                </div>
              </div>
              <div className="integration-controls">
                <input
                  aria-label={`${name}-key`}
                  className="hana-input"
                  type={keyVisibility[name] ? "text" : "password"}
                  value={keyVisibility[name] ? config.apiKey : maskKey(config.apiKey)}
                  onChange={(event) =>
                    updatePending("integrations", {
                      [name]: { ...config, apiKey: event.target.value },
                    })
                  }
                />
                <button
                  type="button"
                  className="button"
                  aria-label={`${name}-toggle-visibility`}
                  onClick={() =>
                    setKeyVisibility((current) => ({ ...current, [name]: !current[name] }))
                  }
                >
                  {keyVisibility[name] ? "Hide" : "Show"}
                </button>
                <button type="button" className="button" onClick={() => testIntegration(name)}>
                  Test
                </button>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  function renderVoicePanel() {
    return (
      <>
        <div className="panel-section">
          <div className="panel-title">Input Mode</div>
          <ChoiceCards
            ariaLabel="input-mode-grid"
            items={INPUT_MODES}
            value={effective.voice.inputMode}
            onChange={(value) => updatePending("voice", { inputMode: value })}
          />
        </div>

        <div className="panel-section">
          <div className="panel-title">Output Mode</div>
          <ChoiceCards
            ariaLabel="output-mode-grid"
            items={OUTPUT_MODE_OPTIONS}
            value={effective.voice.outputMode}
            onChange={(value) => updatePending("voice", { outputMode: value })}
          />
        </div>

        <div className="panel-section">
          <div className="panel-title">TTS</div>
          {row(
            "Speech synthesis",
            "Enable local voice output",
            <Toggle
              ariaLabel="tts-toggle"
              checked={effective.voice.ttsEnabled}
              onChange={() =>
                updatePending("voice", { ttsEnabled: !effective.voice.ttsEnabled })
              }
            />
          )}
        </div>
      </>
    );
  }

  function renderAppPanel() {
    return (
      <>
        <div className="panel-section">
          <div className="panel-title">Theme</div>
          <ChoiceCards
            ariaLabel="theme-grid"
            items={THEMES}
            value={effective.app.theme}
            onChange={(value) => handleThemeChange(value)}
          />
        </div>

        <div className="panel-section">
          <div className="panel-title">App Settings</div>
          <div className="settings-form-grid">
            <label className="settings-field">
              <span>Shortcut</span>
              <input
                aria-label="shortcut-input"
                className="hana-input"
                value={effective.app.shortcut}
                onChange={(event) => updatePending("app", { shortcut: event.target.value })}
              />
            </label>
            <label className="settings-field">
              <span>Launch on startup</span>
              <div className="settings-field__toggle">
                <Toggle
                  ariaLabel="auto-launch-toggle"
                  checked={effective.app.autoLaunch}
                  onChange={() =>
                    updatePending("app", { autoLaunch: !effective.app.autoLaunch })
                  }
                />
              </div>
            </label>
          </div>
        </div>
      </>
    );
  }

  const panelById = {
    character: renderCharacterPanel,
    ai: renderAiPanel,
    autonomous: renderAutonomyPanel,
    integrations: renderIntegrationsPanel,
    voice: renderVoicePanel,
    app: renderAppPanel,
  };

  const renderPanel = panelById[active];

  return (
    <section className="settings-shell" data-testid="settings-panel">
      <div className="settings-shell__layout">
        <aside className="settings-sidebar" aria-label="settings sections">
          <div className="settings-sidebar__header">
            <p className="settings-eyebrow">Settings</p>
            <strong>Mockup reference panel</strong>
          </div>
          <div className="settings-sidebar__list">
            {SECTIONS.map(([id, label, summary]) => (
              <button
                key={id}
                type="button"
                className={`settings-sidebar__item ${active === id ? "is-active" : ""}`}
                onClick={() => setActive(id)}
              >
                <span className="settings-sidebar__label">{label}</span>
                <span className="settings-sidebar__summary">{summary}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="settings-content">
          <div className="settings-content__scroll">{renderPanel()}</div>

          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}

          <div className="settings-bottom-bar">
            <button type="button" className="button button--danger" onClick={handleReset}>
              Reset
            </button>
            <div className="settings-bottom-bar__actions">
              <button type="button" className="button" onClick={handleCancel}>
                Cancel
              </button>
              <button type="button" className="button button--primary" onClick={handleConfirm}>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

      {previewOpen ? (
        <div className="dialog" data-testid="preview-dialog">
          <div className="dialog__panel">
            <div className="dialog__header">
              <div>
                <strong>Persona preview</strong>
                <span>Current preset sample output</span>
              </div>
              <button type="button" className="button" onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </div>
            <div className="dialog__content">
              {meta.previewSamples.map((sample) => (
                <p key={sample}>{sample}</p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

Settings.propTypes = {
  settingsState: PropTypes.shape({
    effective: PropTypes.object.isRequired,
    error: PropTypes.string.isRequired,
    handleCancel: PropTypes.func.isRequired,
    handleConfirm: PropTypes.func.isRequired,
    handleReset: PropTypes.func.isRequired,
    handleThemeChange: PropTypes.func.isRequired,
    meta: PropTypes.object.isRequired,
    setError: PropTypes.func.isRequired,
    setMeta: PropTypes.func.isRequired,
    updatePending: PropTypes.func.isRequired,
  }).isRequired,
};

export { maskKey };
export default Settings;
