import { useEffect, useMemo, useState } from "react";
import {
  fetchAutonomous,
  fetchLlmModels,
  fetchModels,
  fetchPersona,
  previewPersona as requestPersonaPreview,
  saveAutonomous,
  savePersona,
  selectLlmModel as requestLlmSelect,
  selectModel,
} from "../services/settings";

export const DEFAULT_SETTINGS = {
  persona: {
    ai_name: "하나",
    owner_nickname: "",
    speech_preset: "bright_friend",
    personality_preset: "energetic",
    interests: "",
    speech_style: "",
  },
  autonomous: {
    proactive_chat: false,
    tip_bubbles: true,
    screen_reaction: true,
    schedule_reminder: false,
    auto_crawl: false,
  },
  outputMode: "chat",
  theme: "dark-anime",
  autoLaunch: false,
  viewportSize: 100,
  viewportOpacity: 100,
};

export function applyTheme(theme) {
  document.body.className = `theme-${theme}`;
}

export default function useSettings() {
  const [saved, setSaved] = useState(DEFAULT_SETTINGS);
  const [pending, setPending] = useState(null);
  const [models, setModels] = useState([]);
  const [currentModelId, setCurrentModelId] = useState("");
  const [llmModels, setLlmModels] = useState([]);
  const [currentLlmModelId, setCurrentLlmModelId] = useState("");
  const [previewSamples, setPreviewSamples] = useState([]);

  useEffect(() => {
    Promise.all([
      fetchPersona().catch(() => null),
      fetchAutonomous().catch(() => null),
      window.hanaDesktop?.getAppSettings?.() || Promise.resolve({}),
    ]).then(([persona, autonomous, appSettings]) => {
      const next = {
        ...DEFAULT_SETTINGS,
        ...(persona ? { persona: { ...DEFAULT_SETTINGS.persona, ...persona } } : {}),
        ...(autonomous ? { autonomous: { ...DEFAULT_SETTINGS.autonomous, ...autonomous } } : {}),
        ...(appSettings?.voice?.outputMode ? { outputMode: appSettings.voice.outputMode } : {}),
        ...(appSettings?.app?.theme ? { theme: appSettings.app.theme } : {}),
        ...(typeof appSettings?.app?.autoLaunch === "boolean" ? { autoLaunch: appSettings.app.autoLaunch } : {}),
        ...(appSettings?.character?.viewportScale ? { viewportSize: appSettings.character.viewportScale } : {}),
        ...(typeof appSettings?.character?.opacity === "number"
          ? { viewportOpacity: appSettings.character.opacity }
          : {}),
      };
      setSaved(next);
      applyTheme(next.theme);
    });
  }, []);

  useEffect(() => {
    async function loadModels() {
      try {
        const payload = await fetchModels();
        setModels(payload.models || []);
        setCurrentModelId(payload.current || payload.models?.[0]?.id || "");
      } catch {
        setModels([]);
      }
    }

    async function loadLlmModels() {
      try {
        const payload = await fetchLlmModels();
        const chatModels = (payload.models || []).filter((model) => model.role === "chat");
        setLlmModels(chatModels);
        setCurrentLlmModelId(payload.current_chat_model || chatModels[0]?.id || "");
      } catch {
        setLlmModels([]);
      }
    }

    loadModels();
    loadLlmModels();
  }, []);

  const current = useMemo(() => pending ?? saved, [pending, saved]);

  function updatePending(key, value) {
    setPending((prev) => ({ ...(prev ?? saved), [key]: value }));
  }

  async function handleSave() {
    const next = pending ?? saved;
    const appSettings = (await window.hanaDesktop?.getAppSettings?.()) || {};
    const currentCharacter = appSettings.character || {};
    const currentApp = appSettings.app || {};
    const currentVoice = appSettings.voice || {};

    await Promise.all([
      savePersona(next.persona).catch(() => null),
      saveAutonomous(next.autonomous).catch(() => null),
    ]);

    await window.hanaDesktop?.saveAppSettings?.({
      app: {
        ...currentApp,
        theme: next.theme,
        autoLaunch: next.autoLaunch,
        shortcut: currentApp.shortcut || "Alt+H",
      },
      character: {
        ...currentCharacter,
        viewportScale: next.viewportSize,
        opacity: next.viewportOpacity,
      },
      voice: {
        ...currentVoice,
        outputMode: next.outputMode,
      },
    });

    setSaved(next);
    setPending(null);
    try {
      const channel = new BroadcastChannel("hana-overlay");
      channel.postMessage({
        type: "character_settings_updated",
        character: {
          viewportScale: next.viewportSize,
          opacity: next.viewportOpacity,
        },
      });
      channel.close();
    } catch {}
    window.hanaDesktop?.settingsSaved?.({
      theme: next.theme,
      autoLaunch: next.autoLaunch,
    });
    if (next.autoLaunch !== saved.autoLaunch) {
      window.hanaDesktop?.setAutoLaunch?.(next.autoLaunch);
    }
  }

  function handleCancel() {
    setPending(null);
    applyTheme(saved.theme);
  }

  function handleReset() {
    if (window.confirm("모든 설정을 초기화할까요?")) {
      setPending(DEFAULT_SETTINGS);
      applyTheme(DEFAULT_SETTINGS.theme);
    }
  }

  async function previewPersona() {
    const payload = pending ?? saved;
    try {
      const data = await requestPersonaPreview(payload.persona);
      setPreviewSamples(data.samples || []);
      return data.samples || [];
    } catch {
      setPreviewSamples([]);
      return [];
    }
  }

  async function selectCharacterModel(modelId) {
    setCurrentModelId(modelId);
    await selectModel(modelId).catch(() => null);
  }

  async function selectLlmModel(modelId) {
    setCurrentLlmModelId(modelId);
    await requestLlmSelect(modelId).catch(() => null);
  }

  return {
    saved,
    pending,
    current,
    models,
    currentModelId,
    llmModels,
    currentLlmModelId,
    previewSamples,
    updatePending,
    handleSave,
    handleCancel,
    handleReset,
    previewPersona,
    selectCharacterModel,
    selectLlmModel,
    setPreviewSamples,
  };
}
