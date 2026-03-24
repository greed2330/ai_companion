import { useEffect, useMemo, useState } from "react";
import {
  fetchAutonomous,
  fetchLlmModels,
  fetchModels,
  fetchPersona,
  saveAutonomous,
  savePersona,
  selectLlmModel,
  selectModel
} from "../services/settings";
import { OUTPUT_MODES } from "../constants/outputModes";

export const DEFAULT_SETTINGS = {
  character: {
    modelId: "",
    modelType: "Live2D",
    viewportScale: 100
  },
  persona: {
    ai_name: "하나",
    owner_nickname: "",
    speech_preset: "bright_friend",
    speech_style: "",
    personality_preset: "energetic",
    personality: "",
    interests: ""
  },
  aiModel: {
    chatModelId: "",
    status: "연결됨",
    huggingFacePath: "",
    huggingFaceFound: 0
  },
  autonomous: {
    masterEnabled: false,
    auto_search: false,
    background_search: false,
    crawl_learning: false,
    auto_react: false,
    proactive_chat: false,
    screen_reaction: true,
    assist_work: false,
    terminal_access: false,
    document_link: false,
    search_limit: 10,
    tip_bubbles: true,
    schedule_reminder: false,
    auto_crawl: false
  },
  integrations: {
    serper: { status: "grey", apiKey: "" },
    google_calendar: { status: "grey", apiKey: "", note: "credentials.json 필요" },
    github: { status: "grey", apiKey: "" }
  },
  voice: {
    inputMode: "text",
    outputMode: OUTPUT_MODES.CHAT,
    ttsEnabled: false,
    voicePreset: "kokoro",
    samplePath: "",
    hotwordEnabled: false
  },
  app: {
    theme: "dark-anime",
    shortcut: "Alt+H",
    autoLaunch: false
  }
};

function mergeDeep(base, patch) {
  const next = { ...base };

  Object.entries(patch || {}).forEach(([key, value]) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof base[key] === "object"
    ) {
      next[key] = mergeDeep(base[key], value);
      return;
    }

    next[key] = value;
  });

  return next;
}

export function applyTheme(theme) {
  document.body.className = `theme-${theme}`;
}

function normalizeAutonomous(payload) {
  const next = {
    ...DEFAULT_SETTINGS.autonomous,
    ...payload
  };

  next.auto_search = Boolean(next.background_search || next.crawl_learning || next.auto_crawl);
  next.auto_react = Boolean(next.proactive_chat || next.screen_reaction);
  next.assist_work = Boolean(next.terminal_access || next.document_link);
  next.masterEnabled = Boolean(next.auto_search || next.auto_react || next.assist_work);
  return next;
}

export default function useSettings() {
  const [saved, setSaved] = useState(null);
  const [pending, setPending] = useState(null);
  const [meta, setMeta] = useState({
    characterModels: [],
    llmModels: [],
    previewSamples: [],
    integrationState: {}
  });
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [
          persona,
          autonomous,
          characterModelsPayload,
          llmModelsPayload,
          appSettings
        ] = await Promise.all([
          fetchPersona(),
          fetchAutonomous(),
          fetchModels(),
          fetchLlmModels(),
          window.hanaDesktop?.getAppSettings?.() || {}
        ]);

        const currentCharacter =
          characterModelsPayload.models?.find(
            (model) => model.id === characterModelsPayload.current
          ) || characterModelsPayload.models?.[0];

        const nextSaved = mergeDeep(DEFAULT_SETTINGS, {
          character: {
            modelId: currentCharacter?.id || "",
            modelType: currentCharacter?.type?.toUpperCase() || "Live2D"
          },
          persona,
          aiModel: {
            chatModelId: llmModelsPayload.current_chat_model || "",
            status: "연결됨"
          },
          autonomous: normalizeAutonomous(autonomous),
          app: appSettings?.app || {},
          voice: appSettings?.voice || {},
          integrations: appSettings?.integrations || {}
        });

        setMeta((current) => ({
          ...current,
          characterModels: characterModelsPayload.models || [],
          llmModels: llmModelsPayload.models || []
        }));
        setSaved(nextSaved);
        applyTheme(nextSaved.app.theme);
      } catch (loadError) {
        setError(loadError.message);
        setSaved(DEFAULT_SETTINGS);
        applyTheme(DEFAULT_SETTINGS.app.theme);
      }
    }

    load();
  }, []);

  const effective = useMemo(
    () => mergeDeep(saved || DEFAULT_SETTINGS, pending || {}),
    [pending, saved]
  );

  function updatePending(section, value) {
    setPending((current) =>
      mergeDeep(current || {}, {
        [section]: mergeDeep((effective || DEFAULT_SETTINGS)[section], value)
      })
    );
  }

  async function handleConfirm() {
    const next = effective;

    await savePersona(next.persona);
    await saveAutonomous({
      proactive_chat: next.autonomous.proactive_chat,
      tip_bubbles: next.autonomous.tip_bubbles,
      screen_reaction: next.autonomous.screen_reaction,
      schedule_reminder: next.autonomous.schedule_reminder,
      auto_crawl: next.autonomous.auto_crawl
    });

    if (next.character.modelId && next.character.modelId !== saved?.character?.modelId) {
      await selectModel(next.character.modelId);
      await window.__characterRenderer?._loadContext?.(next.character.modelId);
    }

    if (next.aiModel.chatModelId && next.aiModel.chatModelId !== saved?.aiModel?.chatModelId) {
      await selectLlmModel(next.aiModel.chatModelId);
    }

    await window.hanaDesktop?.saveAppSettings?.({
      app: next.app,
      integrations: next.integrations,
      voice: next.voice
    });

    if (saved?.persona?.ai_name !== next.persona.ai_name) {
      window.hanaDesktop?.notifyAiNameChanged?.(next.persona.ai_name);
    }

    setSaved(next);
    setPending(null);
  }

  function handleCancel() {
    setPending(null);
    applyTheme((saved || DEFAULT_SETTINGS).app.theme);
  }

  async function handleReset() {
    if (!window.confirm("모든 설정을 초기화할까요?")) {
      return;
    }

    await savePersona(DEFAULT_SETTINGS.persona);
    await saveAutonomous({
      proactive_chat: DEFAULT_SETTINGS.autonomous.proactive_chat,
      tip_bubbles: DEFAULT_SETTINGS.autonomous.tip_bubbles,
      screen_reaction: DEFAULT_SETTINGS.autonomous.screen_reaction,
      schedule_reminder: DEFAULT_SETTINGS.autonomous.schedule_reminder,
      auto_crawl: DEFAULT_SETTINGS.autonomous.auto_crawl
    });
    await window.hanaDesktop?.saveAppSettings?.({
      app: DEFAULT_SETTINGS.app,
      integrations: DEFAULT_SETTINGS.integrations,
      voice: DEFAULT_SETTINGS.voice
    });
    setSaved(DEFAULT_SETTINGS);
    setPending(null);
    applyTheme(DEFAULT_SETTINGS.app.theme);
  }

  function handleThemeChange(theme) {
    updatePending("app", { theme });
    applyTheme(theme);
  }

  return {
    effective,
    error,
    meta,
    pending,
    saved,
    setError,
    setMeta,
    updatePending,
    handleCancel,
    handleConfirm,
    handleReset,
    handleThemeChange
  };
}
