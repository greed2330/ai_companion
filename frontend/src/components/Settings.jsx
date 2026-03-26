import { useState } from "react";
import PropTypes from "prop-types";
import HierarchyCheckbox from "./HierarchyCheckbox";
import { OUTPUT_MODES } from "../constants/outputModes";
import { buildApiUrl } from "../services/api";
import { previewPersona } from "../services/settings";

const SECTIONS = [
  { id: "character", label: "캐릭터" },
  { id: "ai", label: "AI & 모델" },
  { id: "autonomous", label: "자율 행동" },
  { id: "integrations", label: "외부 연동" },
  { id: "voice", label: "음성" },
  { id: "app", label: "앱 설정" }
];

const SPEECH_PRESETS = ["bright_friend", "cheerful_girl", "tsundere", "calm_noona", "playful", "custom"];
const PERSONALITY_PRESETS = ["energetic", "warm", "sharp", "emotional", "playful", "custom"];
const THEMES = ["dark-anime", "glass", "minimal"];

function maskKey(key) {
  return key ? `${key.slice(0, 4)}...${key.slice(-4)}` : "";
}

function StatusDot({ status }) {
  return <span className={`status-dot status-dot--${status}`} />;
}

StatusDot.propTypes = {
  status: PropTypes.string.isRequired
};

function Settings({ settingsState }) {
  const { effective, error, handleCancel, handleConfirm, handleReset, handleThemeChange, meta, setError, setMeta, updatePending } =
    settingsState;
  const [openSection, setOpenSection] = useState("character");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [integrationUi, setIntegrationUi] = useState({});
  const [keyVisibility, setKeyVisibility] = useState({});

  async function handlePreview() {
    const payload = await previewPersona({
      speech_preset: effective.persona.speech_preset,
      personality_preset: effective.persona.personality_preset
    });
    setMeta((current) => ({ ...current, previewSamples: payload.samples || [] }));
    setPreviewOpen(true);
  }

  function toggleAutonomousWarning() {
    if (!effective.autonomous.masterEnabled) {
      const current = window.hanaDesktop?.getAppSettings?.();
      Promise.resolve(current).then((appSettings) => {
        if (appSettings?.autonomousWarningShown) {
          return;
        }

        window.alert(
          "주의\n하나가 오너 동의 없이 자율적으로 행동합니다.\n모든 데이터는 이 PC에만 저장됩니다."
        );
        window.hanaDesktop?.saveAppSettings?.({
          ...appSettings,
          autonomousWarningShown: true
        });
      });
    }

    updatePending("autonomous", { masterEnabled: !effective.autonomous.masterEnabled });
  }

  function setAutonomousChildren(children, checked) {
    const next = {};
    children.forEach((key) => {
      next[key] = checked;
    });
    updatePending("autonomous", next);
  }

  async function testIntegration(name, apiKey) {
    setIntegrationUi((current) => ({
      ...current,
      [name]: { state: "loading", message: "확인 중..." }
    }));

    try {
      const response = await fetch(buildApiUrl(`/settings/integrations/${name}/test`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey })
      });
      const payload = await response.json();
      const succeeded = payload.success === true;
      setIntegrationUi((current) => ({
        ...current,
        [name]: {
          state: succeeded ? "success" : "fail",
          message: succeeded
            ? `연결됨 (${payload.response_ms}ms)`
            : `실패 - ${payload.error}`
        }
      }));
      if (succeeded) {
        updatePending("integrations", { [name]: { apiKey, status: "connected" } });
      }
    } catch {
      setIntegrationUi((current) => ({
        ...current,
        [name]: { state: "fail", message: "서버 연결 실패" }
      }));
    }

    window.setTimeout(() => {
      setIntegrationUi((current) => ({
        ...current,
        [name]: { state: "idle", message: "" }
      }));
    }, 3000);
  }

  const autoSearchChildren = [
    effective.autonomous.background_search,
    effective.autonomous.crawl_learning
  ];
  const autoReactChildren = [
    effective.autonomous.proactive_chat,
    effective.autonomous.screen_reaction
  ];
  const assistChildren = [
    effective.autonomous.terminal_access,
    effective.autonomous.document_link
  ];
  const serperOk = effective.integrations.serper.status === "connected";

  return (
    <section className="settings-shell" data-testid="settings-panel">
      <h2 className="settings-shell__title">설정</h2>
      <div className="settings-body">
      {SECTIONS.map((section) => (
        <section key={section.id} className="accordion">
          <button
            type="button"
            className="accordion__header"
            onClick={() =>
              setOpenSection((current) => (current === section.id ? "" : section.id))
            }
          >
            {section.label}
          </button>
          {openSection === section.id ? (
            <div className="accordion__body">
              {section.id === "character" ? (
                <>
                  <label>
                    캐릭터 모델
                    <select
                      aria-label="character-model"
                      value={effective.character.modelId}
                      onChange={(event) => {
                        const model =
                          meta.characterModels.find((item) => item.id === event.target.value) || {};
                        updatePending("character", {
                          modelId: event.target.value,
                          modelType: (model.type || "").toUpperCase()
                        });
                      }}
                    >
                      {meta.characterModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>현재: {effective.character.modelId || "없음"} ({effective.character.modelType})</p>
                  <label>
                    기본 뷰포트: 크기 {effective.character.viewportScale}%
                    <input
                      aria-label="viewport-scale"
                      max="150"
                      min="50"
                      type="range"
                      value={effective.character.viewportScale}
                      onChange={(event) =>
                        updatePending("character", {
                          viewportScale: Number(event.target.value)
                        })
                      }
                    />
                  </label>
                </>
              ) : null}

              {section.id === "ai" ? (
                <>
                  <label>
                    채팅 모델 (Ollama)
                    <select
                      aria-label="chat-model"
                      value={effective.aiModel.chatModelId}
                      onChange={(event) =>
                        updatePending("aiModel", { chatModelId: event.target.value })
                      }
                    >
                      {meta.llmModels
                        .filter((model) => model.role === "chat")
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.id}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p>상태: {effective.aiModel.status}</p>
                  <label className="settings-row settings-row--disabled">
                    HuggingFace 직접 실행
                    <span className="phase-badge">Phase 5</span>
                  </label>
                  <label>
                    AI 이름
                    <input
                      aria-label="ai-name"
                      value={effective.persona.ai_name}
                      onChange={(event) =>
                        updatePending("persona", { ai_name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    오너 호칭
                    <input
                      aria-label="owner-nickname"
                      value={effective.persona.owner_nickname}
                      onChange={(event) =>
                        updatePending("persona", {
                          owner_nickname: event.target.value
                        })
                      }
                    />
                  </label>
                  <label>
                    말투 프리셋
                    <select
                      aria-label="speech-preset"
                      value={effective.persona.speech_preset}
                      onChange={(event) =>
                        updatePending("persona", {
                          speech_preset: event.target.value
                        })
                      }
                    >
                      {SPEECH_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  </label>
                  {effective.persona.speech_preset === "custom" ? (
                    <input
                      aria-label="speech-style"
                      value={effective.persona.speech_style}
                      onChange={(event) =>
                        updatePending("persona", {
                          speech_style: event.target.value
                        })
                      }
                    />
                  ) : null}
                  <label>
                    성격 프리셋
                    <select
                      aria-label="personality-preset"
                      value={effective.persona.personality_preset}
                      onChange={(event) =>
                        updatePending("persona", {
                          personality_preset: event.target.value
                        })
                      }
                    >
                      {PERSONALITY_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    관심사
                    <input
                      aria-label="interests"
                      value={effective.persona.interests}
                      onChange={(event) =>
                        updatePending("persona", { interests: event.target.value })
                      }
                    />
                  </label>
                  <button type="button" onClick={handlePreview}>
                    미리보기
                  </button>
                </>
              ) : null}

              {section.id === "autonomous" ? (
                <>
                  <p>활성화 시 하나가 오너 동의 없이 자율적으로 행동합니다.</p>
                  <HierarchyCheckbox
                    checked={effective.autonomous.masterEnabled}
                    indeterminate={
                      !effective.autonomous.masterEnabled &&
                      (effective.autonomous.auto_search ||
                        effective.autonomous.auto_react ||
                        effective.autonomous.assist_work)
                    }
                    label="자율 행동 전체"
                    onChange={toggleAutonomousWarning}
                  >
                    <HierarchyCheckbox
                      checked={autoSearchChildren.every(Boolean)}
                      indeterminate={
                        autoSearchChildren.some(Boolean) &&
                        !autoSearchChildren.every(Boolean)
                      }
                      label="자율 검색"
                      onChange={() =>
                        setAutonomousChildren(
                          ["background_search", "crawl_learning"],
                          !autoSearchChildren.every(Boolean)
                        )
                      }
                    >
                      <HierarchyCheckbox
                        checked={effective.autonomous.background_search}
                        disabled={!serperOk}
                        label="백그라운드 검색"
                        onChange={() =>
                          updatePending("autonomous", {
                            background_search: !effective.autonomous.background_search
                          })
                        }
                      />
                      {!serperOk ? <span>Serper API 연결 필요</span> : null}
                      <HierarchyCheckbox
                        checked={effective.autonomous.crawl_learning}
                        label="크롤링 & 학습"
                        onChange={() =>
                          updatePending("autonomous", {
                            crawl_learning: !effective.autonomous.crawl_learning
                          })
                        }
                      />
                    </HierarchyCheckbox>
                    <HierarchyCheckbox
                      checked={autoReactChildren.every(Boolean)}
                      indeterminate={
                        autoReactChildren.some(Boolean) &&
                        !autoReactChildren.every(Boolean)
                      }
                      label="자율 반응"
                      onChange={() =>
                        setAutonomousChildren(
                          ["proactive_chat", "screen_reaction"],
                          !autoReactChildren.every(Boolean)
                        )
                      }
                    >
                      <HierarchyCheckbox
                        checked={effective.autonomous.proactive_chat}
                        label="능동적 말 걸기"
                        onChange={() =>
                          updatePending("autonomous", {
                            proactive_chat: !effective.autonomous.proactive_chat
                          })
                        }
                      />
                      <HierarchyCheckbox
                        checked={effective.autonomous.screen_reaction}
                        label="화면 주시"
                        onChange={() =>
                          updatePending("autonomous", {
                            screen_reaction: !effective.autonomous.screen_reaction
                          })
                        }
                      />
                    </HierarchyCheckbox>
                    <HierarchyCheckbox
                      badge="Phase 4"
                      checked={assistChildren.every(Boolean)}
                      disabled
                      indeterminate={assistChildren.some(Boolean) && !assistChildren.every(Boolean)}
                      label="작업 돕기"
                      onChange={() => {}}
                    >
                      <HierarchyCheckbox checked={false} disabled label="터미널 접속" onChange={() => {}} />
                      <HierarchyCheckbox checked={false} disabled label="문서 연결" onChange={() => {}} />
                    </HierarchyCheckbox>
                  </HierarchyCheckbox>
                  <label>
                    검색 일일 한도
                    <input
                      aria-label="search-limit"
                      type="number"
                      value={effective.autonomous.search_limit}
                      onChange={(event) =>
                        updatePending("autonomous", {
                          search_limit: Number(event.target.value)
                        })
                      }
                    />
                  </label>
                </>
              ) : null}

              {section.id === "integrations" ? (
                Object.entries(effective.integrations).map(([name, config]) => (
                  <div key={name} className="integration-row">
                    <div>
                      <StatusDot status={integrationUi[name]?.state === "fail" ? "red" : config.status} />
                      <strong>{name}</strong>
                    </div>
                    <input
                      aria-label={`${name}-key`}
                      type={keyVisibility[name] ? "text" : "password"}
                      value={keyVisibility[name] ? config.apiKey : ""}
                      placeholder={keyVisibility[name] ? "API 키 입력" : maskKey(config.apiKey) || "API 키 미설정"}
                      onChange={(event) =>
                        updatePending("integrations", {
                          [name]: { ...config, apiKey: event.target.value }
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`${name}-toggle-visibility`}
                      onClick={() =>
                        setKeyVisibility((current) => ({
                          ...current,
                          [name]: !current[name]
                        }))
                      }
                    >
                      👁
                    </button>
                    <button type="button" onClick={() => testIntegration(name, config.apiKey)}>
                      연결
                    </button>
                    <span>{integrationUi[name]?.message || config.note || config.status}</span>
                  </div>
                ))
              ) : null}

              {section.id === "voice" ? (
                <>
                  <label>
                    입력 방식
                    <select
                      aria-label="input-mode"
                      value={effective.voice.inputMode}
                      onChange={(event) =>
                        updatePending("voice", { inputMode: event.target.value })
                      }
                    >
                      <option value="text">텍스트</option>
                      <option value="voice">음성</option>
                      <option value="both">둘 다</option>
                    </select>
                  </label>
                  <label>
                    출력 방식
                    <select
                      aria-label="output-mode"
                      value={effective.voice.outputMode}
                      onChange={(event) =>
                        updatePending("voice", { outputMode: event.target.value })
                      }
                    >
                      {Object.values(OUTPUT_MODES).map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input
                      checked={effective.voice.ttsEnabled}
                      type="checkbox"
                      onChange={() =>
                        updatePending("voice", {
                          ttsEnabled: !effective.voice.ttsEnabled
                        })
                      }
                    />
                    TTS ON
                  </label>
                  <button type="button" disabled>
                    미리듣기 - Phase 4.5
                  </button>
                </>
              ) : null}

              {section.id === "app" ? (
                <>
                  <label>
                    테마
                    <select
                      aria-label="theme-select"
                      value={effective.app.theme}
                      onChange={(event) => handleThemeChange(event.target.value)}
                    >
                      {THEMES.map((theme) => (
                        <option key={theme} value={theme}>
                          {theme}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    단축키
                    <input
                      aria-label="shortcut-input"
                      value={effective.app.shortcut}
                      onChange={(event) =>
                        updatePending("app", { shortcut: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <input
                      checked={effective.app.autoLaunch}
                      type="checkbox"
                      onChange={() =>
                        updatePending("app", { autoLaunch: !effective.app.autoLaunch })
                      }
                    />
                    시작 시 자동 실행
                  </label>
                  <button type="button" onClick={() => setError("이용약관은 Phase 7.5에서 추가돼.")}>
                    보기
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      ))}

      {error ? <p role="alert">{error}</p> : null}
      </div>

      <div className="settings-actions">
        <button type="button" onClick={handleConfirm}>
          확인
        </button>
        <button type="button" onClick={handleCancel}>
          취소
        </button>
        <button type="button" onClick={handleReset}>
          초기화
        </button>
      </div>

      {previewOpen ? (
        <div className="dialog" data-testid="preview-dialog">
          <h3>미리보기</h3>
          {meta.previewSamples.map((sample) => (
            <p key={sample}>{sample}</p>
          ))}
          <button type="button" onClick={() => setPreviewOpen(false)}>
            닫기
          </button>
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
    updatePending: PropTypes.func.isRequired
  }).isRequired
};

export { maskKey };
export default Settings;
