import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import HierarchyCheckbox from "./HierarchyCheckbox";
import { OUTPUT_MODES } from "../constants/outputModes";
import { previewPersona } from "../services/settings";

const SECTIONS = [
  {
    id: "character",
    label: "캐릭터",
    summary: "현재 모델과 뷰포트를 확인하고 바꿔요."
  },
  {
    id: "ai",
    label: "AI & 모델",
    summary: "채팅 모델과 페르소나를 조정해요."
  },
  {
    id: "autonomous",
    label: "자율 행동",
    summary: "하나의 선제 행동 범위를 관리해요."
  },
  {
    id: "integrations",
    label: "외부 연동",
    summary: "API 키와 연결 상태를 확인해요."
  },
  {
    id: "voice",
    label: "음성",
    summary: "입력, 출력, TTS 동작을 설정해요."
  },
  {
    id: "app",
    label: "앱 설정",
    summary: "테마와 실행 환경을 정리해요."
  }
];

const SPEECH_PRESETS = [
  { value: "bright_friend", label: "밝은 친구" },
  { value: "cheerful_girl", label: "해맑은 소녀" },
  { value: "tsundere", label: "츤데레" },
  { value: "calm_noona", label: "차분한 누나" },
  { value: "playful", label: "장난꾸러기" },
  { value: "custom", label: "직접 입력" }
];

const PERSONALITY_PRESETS = [
  { value: "energetic", label: "활발함" },
  { value: "warm", label: "다정함" },
  { value: "sharp", label: "똑부러짐" },
  { value: "emotional", label: "감성적" },
  { value: "playful", label: "장난기" },
  { value: "custom", label: "직접 입력" }
];

const INPUT_MODES = [
  { value: "text", label: "텍스트" },
  { value: "voice", label: "음성" },
  { value: "both", label: "둘 다" }
];

const OUTPUT_MODE_OPTIONS = [
  { value: OUTPUT_MODES.CHAT, label: "채팅창", detail: "기본 텍스트 응답" },
  { value: OUTPUT_MODES.BUBBLE, label: "말풍선", detail: "짧고 빠른 오버레이 출력" },
  { value: OUTPUT_MODES.VOICE, label: "음성", detail: "TTS만 재생" },
  {
    value: OUTPUT_MODES.BUBBLE_VOICE,
    label: "말풍선 + 음성",
    detail: "화면과 소리를 동시에 사용"
  }
];

const THEMES = [
  { value: "dark-anime", label: "다크 애니", detail: "짙은 대비와 선명한 포인트" },
  { value: "glass", label: "글래스", detail: "부드러운 반투명 패널" },
  { value: "minimal", label: "미니멀 라이트", detail: "가볍고 정돈된 작업 중심" }
];

function maskKey(key) {
  return key ? `${key.slice(0, 4)}...${key.slice(-4)}` : "";
}

function getStatusLabel(status) {
  switch (status) {
    case "connected":
      return "연결됨";
    case "yellow":
      return "키 등록됨";
    case "red":
      return "테스트 실패";
    default:
      return "미연결";
  }
}

function getStatusTone(status, transientState) {
  if (transientState === "fail") {
    return "red";
  }

  if (transientState === "success") {
    return "connected";
  }

  if (transientState === "loading") {
    return "yellow";
  }

  return status || "grey";
}

function StatusDot({ status }) {
  return <span className={`status-dot status-dot--${status}`} />;
}

StatusDot.propTypes = {
  status: PropTypes.string.isRequired
};

function ChoiceCards({ ariaLabel, options, value, onChange }) {
  return (
    <div className="choice-grid" aria-label={ariaLabel} role="list">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`choice-card ${value === option.value ? "is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          <strong>{option.label}</strong>
          {option.detail ? <span>{option.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}

ChoiceCards.propTypes = {
  ariaLabel: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.string.isRequired
};

function SectionNav({ activeSection, onSelect, selectedModelName }) {
  return (
    <aside className="settings-nav" aria-label="settings sections">
      <div className="settings-nav__header">
        <p>설정</p>
        <strong>하나를 지금 작업 흐름에 맞게 다듬어요.</strong>
      </div>
      <div className="settings-nav__list">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`settings-nav__item ${activeSection === section.id ? "is-active" : ""}`}
            onClick={() => onSelect(section.id)}
          >
            <strong>{section.label}</strong>
            <span>{section.id === "character" ? selectedModelName : section.summary}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

SectionNav.propTypes = {
  activeSection: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  selectedModelName: PropTypes.string.isRequired
};

function DetailHeader({ title, description, badge }) {
  return (
    <header className="settings-detail__header">
      <div>
        <p>Settings</p>
        <h2>{title}</h2>
        <span>{description}</span>
      </div>
      {badge ? <div className="settings-detail__badge">{badge}</div> : null}
    </header>
  );
}

DetailHeader.propTypes = {
  badge: PropTypes.string,
  description: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired
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
    updatePending
  } = settingsState;
  const [activeSection, setActiveSection] = useState("character");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [integrationUi, setIntegrationUi] = useState({});
  const [keyVisibility, setKeyVisibility] = useState({});

  const selectedModel = useMemo(
    () => meta.characterModels.find((model) => model.id === effective.character.modelId) || null,
    [effective.character.modelId, meta.characterModels]
  );

  const currentSection = SECTIONS.find((section) => section.id === activeSection) || SECTIONS[0];
  const selectedModelType = (selectedModel?.type || effective.character.modelType || "model")
    .toString()
    .toUpperCase();
  const selectedModelName = selectedModel?.name || effective.character.modelId || "모델 미선택";
  const serperOk = effective.integrations.serper.status === "connected";

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

  async function handlePreview() {
    try {
      const payload = await previewPersona({
        speech_preset: effective.persona.speech_preset,
        personality_preset: effective.persona.personality_preset
      });
      setMeta((current) => ({ ...current, previewSamples: payload.samples || [] }));
      setPreviewOpen(true);
    } catch (previewError) {
      setError(previewError.message);
    }
  }

  function ensureAutonomousWarning() {
    if (effective.autonomous.masterEnabled) {
      return;
    }

    Promise.resolve(window.hanaDesktop?.getAppSettings?.()).then((appSettings) => {
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

  function updateAutonomous(patch) {
    updatePending("autonomous", patch);
  }

  function setAutonomousChildren(children, checked) {
    const patch = {};
    children.forEach((key) => {
      patch[key] = checked;
    });
    updateAutonomous(patch);
  }

  function toggleMasterAutonomous() {
    const nextChecked = !effective.autonomous.masterEnabled;
    if (nextChecked) {
      ensureAutonomousWarning();
    }

    updateAutonomous({
      masterEnabled: nextChecked,
      background_search: nextChecked ? serperOk : false,
      crawl_learning: nextChecked,
      proactive_chat: nextChecked,
      screen_reaction: nextChecked,
      terminal_access: false,
      document_link: false
    });
  }

  async function testIntegration(name) {
    setIntegrationUi((current) => ({
      ...current,
      [name]: { state: "loading", message: "연결 확인 중..." }
    }));

    try {
      const response = await fetch(`/settings/integrations/${name}/test`, {
        method: "POST"
      });
      const payload = await response.json();
      setIntegrationUi((current) => ({
        ...current,
        [name]: {
          state: payload.success ? "success" : "fail",
          message: payload.success
            ? `연결됨 (${payload.response_ms}ms)`
            : `실패 - ${payload.error || "응답 없음"}`
        }
      }));
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

  function renderCharacterSection() {
    return (
      <div className="settings-detail__stack">
        <DetailHeader
          title="캐릭터"
          description="현재 적용 모델과 뷰포트 크기를 빠르게 확인하고 바꿔요."
          badge={selectedModelType}
        />

        <section className="settings-hero-card">
          <div className="settings-hero-card__art">
            <div className="settings-hero-card__avatar">
              {(selectedModelName || "H").slice(0, 1).toUpperCase()}
            </div>
          </div>
          <div className="settings-hero-card__meta">
            <strong>{selectedModelName}</strong>
            <span>{selectedModelType} 모델이 현재 오버레이에 적용돼 있어요.</span>
            <p>
              모델을 바꾸면 캐릭터 렌더러가 새 컨텍스트를 불러와서 파라미터 매핑을 다시 구성해요.
            </p>
            <div className="settings-inline-meta">
              <div>
                <small>상태</small>
                <strong>적용 중</strong>
              </div>
              <div>
                <small>뷰포트</small>
                <strong>{effective.character.viewportScale}%</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-panel-card">
          <div className="settings-panel-card__header">
            <div>
              <strong>모델 선택</strong>
              <span>기본 드롭다운 대신 카드로 현재 상태를 비교할 수 있게 구성했어요.</span>
            </div>
          </div>
          <ChoiceCards
            ariaLabel="character-model-grid"
            value={effective.character.modelId}
            options={meta.characterModels.map((model) => ({
              value: model.id,
              label: model.name,
              detail: `${(model.type || "model").toUpperCase()} 모델`
            }))}
            onChange={(value) => {
              const model = meta.characterModels.find((item) => item.id === value) || {};
              updatePending("character", {
                modelId: value,
                modelType: model.type || effective.character.modelType
              });
            }}
          />
        </section>

        <section className="settings-panel-card">
          <div className="settings-panel-card__header">
            <div>
              <strong>기본 뷰포트</strong>
              <span>데스크탑 위 캐릭터 체감 크기를 조정해요.</span>
            </div>
          </div>
          <div className="settings-slider-row">
            <label htmlFor="viewport-scale">
              크기 <strong>{effective.character.viewportScale}%</strong>
            </label>
            <input
              id="viewport-scale"
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
            <div className="settings-slider-scale">
              <span>50%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderAiSection() {
    return (
      <div className="settings-detail__stack">
        <DetailHeader
          title="AI & 모델"
          description="대화 모델, 이름, 말투와 성격을 한 화면에서 조정해요."
          badge={effective.aiModel.status}
        />

        <section className="settings-panel-card">
          <div className="settings-panel-card__header">
            <div>
              <strong>채팅 모델</strong>
              <span>현재 Ollama에 연결된 모델 중 채팅용 모델을 고를 수 있어요.</span>
            </div>
            <div className="settings-status-pill">{effective.aiModel.status}</div>
          </div>
          <ChoiceCards
            ariaLabel="chat-model-grid"
            value={effective.aiModel.chatModelId}
            options={meta.llmModels
              .filter((model) => model.role === "chat")
              .map((model) => ({
                value: model.id,
                label: model.id,
                detail: "Ollama chat model"
              }))}
            onChange={(value) => updatePending("aiModel", { chatModelId: value })}
          />
        </section>

        <section className="settings-panel-card settings-panel-card--muted">
          <div className="settings-panel-card__header">
            <div>
              <strong>HuggingFace 직접 실행</strong>
              <span>탐색 경로와 로컬 모델 검색은 다음 단계에서 연결돼요.</span>
            </div>
            <div className="settings-phase-chip">Phase 5</div>
          </div>
        </section>

        <section className="settings-panel-card">
          <div className="settings-panel-card__header">
            <div>
              <strong>페르소나</strong>
              <span>이름, 호칭, 말투, 성격을 한 번에 조정해요.</span>
            </div>
          </div>
          <div className="settings-form-grid">
            <div className="settings-field">
              <label htmlFor="ai-name">AI 이름</label>
              <input
                id="ai-name"
                aria-label="ai-name"
                value={effective.persona.ai_name}
                onChange={(event) => updatePending("persona", { ai_name: event.target.value })}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="owner-nickname">오너 호칭</label>
              <input
                id="owner-nickname"
                aria-label="owner-nickname"
                placeholder="예: 자기야, 주인님"
                value={effective.persona.owner_nickname}
                onChange={(event) =>
                  updatePending("persona", { owner_nickname: event.target.value })
                }
              />
            </div>
          </div>

          <div className="settings-field">
            <label>말투 프리셋</label>
            <ChoiceCards
              ariaLabel="speech-preset-grid"
              value={effective.persona.speech_preset}
              options={SPEECH_PRESETS}
              onChange={(value) => updatePending("persona", { speech_preset: value })}
            />
          </div>

          {effective.persona.speech_preset === "custom" ? (
            <div className="settings-field">
              <label htmlFor="speech-style">직접 입력 말투</label>
              <input
                id="speech-style"
                aria-label="speech-style"
                placeholder="예: 말끝에 다냥을 붙여줘"
                value={effective.persona.speech_style}
                onChange={(event) => updatePending("persona", { speech_style: event.target.value })}
              />
            </div>
          ) : null}

          <div className="settings-field">
            <label>성격 프리셋</label>
            <ChoiceCards
              ariaLabel="personality-preset-grid"
              value={effective.persona.personality_preset}
              options={PERSONALITY_PRESETS}
              onChange={(value) => updatePending("persona", { personality_preset: value })}
            />
          </div>

          <div className="settings-field">
            <label htmlFor="interests">관심사</label>
            <input
              id="interests"
              aria-label="interests"
              placeholder="예: 게임이랑 코딩을 좋아해"
              value={effective.persona.interests}
              onChange={(event) => updatePending("persona", { interests: event.target.value })}
            />
          </div>

          <div className="settings-panel-card__actions">
            <button type="button" className="settings-primary-button" onClick={handlePreview}>
              미리보기
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderAutonomousSection() {
    return (
      <div className="settings-detail__stack">
        <DetailHeader
          title="자율 행동"
          description="동의 없이 선제 행동할 수 있는 범위를 계층적으로 관리해요."
          badge={`${effective.autonomous.search_limit}회 / 일`}
        />

        <section className="settings-panel-card">
          <p className="settings-warning-copy">
            활성화하면 하나가 오너 동의 없이 자율적으로 반응하거나 행동할 수 있어요.
          </p>
          <HierarchyCheckbox
            checked={effective.autonomous.masterEnabled}
            indeterminate={
              !effective.autonomous.masterEnabled &&
              (autoSearchChildren.some(Boolean) ||
                autoReactChildren.some(Boolean) ||
                assistChildren.some(Boolean))
            }
            label="자율 행동 전체"
            onChange={toggleMasterAutonomous}
          >
            <HierarchyCheckbox
              checked={autoSearchChildren.every(Boolean)}
              indeterminate={autoSearchChildren.some(Boolean) && !autoSearchChildren.every(Boolean)}
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
                  updateAutonomous({
                    background_search: !effective.autonomous.background_search
                  })
                }
              />
              {!serperOk ? <span className="settings-helper">Serper API 연결 필요</span> : null}
              <HierarchyCheckbox
                checked={effective.autonomous.crawl_learning}
                label="크롤링 & 학습"
                onChange={() =>
                  updateAutonomous({
                    crawl_learning: !effective.autonomous.crawl_learning
                  })
                }
              />
            </HierarchyCheckbox>

            <HierarchyCheckbox
              checked={autoReactChildren.every(Boolean)}
              indeterminate={autoReactChildren.some(Boolean) && !autoReactChildren.every(Boolean)}
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
                  updateAutonomous({
                    proactive_chat: !effective.autonomous.proactive_chat
                  })
                }
              />
              <HierarchyCheckbox
                checked={effective.autonomous.screen_reaction}
                label="화면 주시"
                onChange={() =>
                  updateAutonomous({
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
        </section>

        <section className="settings-panel-card">
          <div className="settings-slider-row">
            <label htmlFor="search-limit">
              검색 일일 한도 <strong>{effective.autonomous.search_limit}회</strong>
            </label>
            <input
              id="search-limit"
              aria-label="search-limit"
              max="30"
              min="1"
              type="range"
              value={effective.autonomous.search_limit}
              onChange={(event) =>
                updateAutonomous({
                  search_limit: Number(event.target.value)
                })
              }
            />
            <div className="settings-slider-scale">
              <span>1</span>
              <span>10</span>
              <span>30</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderIntegrationsSection() {
    return (
      <div className="settings-detail__stack">
        <DetailHeader
          title="외부 연동"
          description="연결 상태를 한 눈에 보고, 키를 안전하게 확인할 수 있게 구성했어요."
          badge="PROMPT_06 전까지 UI only"
        />

        {Object.entries(effective.integrations).map(([name, config]) => {
          const displayName =
            name === "google_calendar"
              ? "Google Calendar"
              : name === "serper"
                ? "Serper API"
                : "GitHub";
          const transient = integrationUi[name]?.state;
          const tone = getStatusTone(config.status, transient);

          return (
            <section key={name} className="integration-card">
              <div className="integration-card__title">
                <div>
                  <strong>{displayName}</strong>
                  <span>{getStatusLabel(config.status)}</span>
                </div>
                <StatusDot status={tone} />
              </div>

              <div className="integration-card__controls">
                <input
                  aria-label={`${name}-key`}
                  type={keyVisibility[name] ? "text" : "password"}
                  value={keyVisibility[name] ? config.apiKey : maskKey(config.apiKey)}
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
                  보기
                </button>
                <button type="button" onClick={() => testIntegration(name)}>
                  연결
                </button>
              </div>

              <small className="settings-helper">
                {integrationUi[name]?.message || config.note || getStatusLabel(config.status)}
              </small>
            </section>
          );
        })}
      </div>
    );
  }

  function renderVoiceSection() {
    return (
      <div className="settings-detail__stack">
        <DetailHeader
          title="음성"
          description="입력 방식, 출력 방식, TTS 사용 여부를 작업 흐름에 맞게 조정해요."
          badge={effective.voice.outputMode}
        />

        <section className="settings-panel-card">
          <div className="settings-panel-card__header">
            <div>
              <strong>입력 방식</strong>
              <span>텍스트와 음성 입력을 어떻게 사용할지 결정해요.</span>
            </div>
          </div>
          <ChoiceCards
            ariaLabel="input-mode-grid"
            value={effective.voice.inputMode}
            options={INPUT_MODES}
            onChange={(value) => updatePending("voice", { inputMode: value })}
          />
        </section>

        <section className="settings-panel-card">
          <div className="settings-panel-card__header">
            <div>
              <strong>출력 방식</strong>
              <span>대화창, 말풍선, 음성 출력을 상황에 맞게 고를 수 있어요.</span>
            </div>
          </div>
          <ChoiceCards
            ariaLabel="output-mode-grid"
            value={effective.voice.outputMode}
            options={OUTPUT_MODE_OPTIONS}
            onChange={(value) => updatePending("voice", { outputMode: value })}
          />
        </section>

        <section className="settings-form-grid">
          <div className="settings-toggle-card">
            <div>
              <strong>TTS</strong>
              <span>음성 또는 말풍선 + 음성 모드에서 활성화돼요.</span>
            </div>
            <button
              type="button"
              className={`settings-toggle ${effective.voice.ttsEnabled ? "is-active" : ""}`}
              onClick={() =>
                updatePending("voice", {
                  ttsEnabled: !effective.voice.ttsEnabled
                })
              }
            >
              {effective.voice.ttsEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className="settings-toggle-card settings-toggle-card--disabled">
            <div>
              <strong>핫워드</strong>
              <span>"하나야" 호출은 다음 단계에서 연결돼요.</span>
            </div>
            <button type="button" className="settings-toggle" disabled>
              Phase 4.5
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderAppSection() {
    return (
      <div className="settings-detail__stack">
        <DetailHeader
          title="앱 설정"
          description="테마, 단축키, 실행 옵션을 전체 앱 기준으로 조정해요."
          badge={effective.app.shortcut}
        />

        <section className="settings-panel-card">
          <div className="settings-panel-card__header">
            <div>
              <strong>테마</strong>
              <span>선택 즉시 미리보기로 적용되고, 취소하면 원래 값으로 돌아가요.</span>
            </div>
          </div>
          <ChoiceCards
            ariaLabel="theme-card-grid"
            value={effective.app.theme}
            options={THEMES}
            onChange={(value) => handleThemeChange(value)}
          />
        </section>

        <section className="settings-form-grid">
          <div className="settings-field">
            <label htmlFor="shortcut-input">단축키</label>
            <input
              id="shortcut-input"
              aria-label="shortcut-input"
              value={effective.app.shortcut}
              onChange={(event) => updatePending("app", { shortcut: event.target.value })}
            />
          </div>

          <div className="settings-toggle-card">
            <div>
              <strong>시작 시 자동 실행</strong>
              <span>앱을 실행 환경에 붙여둘지 결정해요.</span>
            </div>
            <button
              type="button"
              className={`settings-toggle ${effective.app.autoLaunch ? "is-active" : ""}`}
              onClick={() => updatePending("app", { autoLaunch: !effective.app.autoLaunch })}
            >
              {effective.app.autoLaunch ? "ON" : "OFF"}
            </button>
          </div>
        </section>

        <section className="settings-panel-card settings-panel-card--muted">
          <div className="settings-panel-card__header">
            <div>
              <strong>이용약관</strong>
              <span>실제 문서는 Phase 7.5에서 채워질 예정이에요.</span>
            </div>
          </div>
          <div className="settings-panel-card__actions">
            <button
              type="button"
              className="settings-secondary-button"
              onClick={() => setError("이용약관 화면은 Phase 7.5에서 연결됩니다.")}
            >
              보기
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderDetail() {
    switch (activeSection) {
      case "character":
        return renderCharacterSection();
      case "ai":
        return renderAiSection();
      case "autonomous":
        return renderAutonomousSection();
      case "integrations":
        return renderIntegrationsSection();
      case "voice":
        return renderVoiceSection();
      case "app":
        return renderAppSection();
      default:
        return null;
    }
  }

  return (
    <section className="settings-shell" data-testid="settings-panel">
      <div className="settings-layout">
        <SectionNav
          activeSection={activeSection}
          onSelect={setActiveSection}
          selectedModelName={selectedModelName}
        />

        <div className="settings-detail">
          <div className="settings-detail__scroll">{renderDetail()}</div>

          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}

          <div className="settings-actions">
            <button type="button" className="settings-secondary-button" onClick={handleCancel}>
              취소
            </button>
            <button type="button" className="settings-secondary-button" onClick={handleReset}>
              초기화
            </button>
            <button type="button" className="settings-primary-button" onClick={handleConfirm}>
              저장
            </button>
          </div>
        </div>
      </div>

      {previewOpen ? (
        <div className="dialog" data-testid="preview-dialog">
          <div className="dialog__panel">
            <div className="dialog__header">
              <div>
                <strong>하나 미리보기</strong>
                <span>현재 말투와 성격 조합으로 만든 샘플 응답이에요.</span>
              </div>
              <button type="button" onClick={() => setPreviewOpen(false)}>
                닫기
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
    updatePending: PropTypes.func.isRequired
  }).isRequired
};

export { maskKey };
export default Settings;
