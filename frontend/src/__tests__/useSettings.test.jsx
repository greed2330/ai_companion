import { act, renderHook, waitFor } from "@testing-library/react";
import useSettings, { DEFAULT_SETTINGS, applyTheme } from "../hooks/useSettings";

jest.mock("../services/settings", () => ({
  fetchAutonomous: jest.fn(() =>
    Promise.resolve({
      proactive_chat: false,
      tip_bubbles: true,
      screen_reaction: true,
      schedule_reminder: false,
      auto_crawl: false,
    })
  ),
  fetchLlmModels: jest.fn(() =>
    Promise.resolve({
      current_chat_model: "qwen3:14b",
      models: [{ id: "qwen3:14b", role: "chat", label: "Qwen 14B" }],
    })
  ),
  fetchModels: jest.fn(() =>
    Promise.resolve({
      current: "furina",
      models: [{ id: "furina", name: "Furina", type: "pmx" }],
    })
  ),
  fetchPersona: jest.fn(() =>
    Promise.resolve({
      ai_name: "하나",
      owner_nickname: "",
      speech_preset: "bright_friend",
      speech_style: "",
      personality_preset: "energetic",
      interests: "",
    })
  ),
  previewPersona: jest.fn(() => Promise.resolve({ samples: ["a", "b", "c"] })),
  saveAutonomous: jest.fn(() => Promise.resolve({ success: true })),
  savePersona: jest.fn(() => Promise.resolve({ success: true })),
  selectLlmModel: jest.fn(() => Promise.resolve({ success: true })),
  selectModel: jest.fn(() => Promise.resolve({ success: true })),
}));

const settingsApi = jest.requireMock("../services/settings");

describe("useSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.className = "";
    window.confirm = jest.fn(() => true);
    window.hanaDesktop.getAppSettings.mockResolvedValue({
      app: { theme: "dark-anime", shortcut: "Alt+H", autoLaunch: false },
      voice: { outputMode: "chat" },
      character: { viewportScale: 100, opacity: 85 },
    });
  });

  test("handleSave posts persona and autonomous settings and clears pending", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.current.persona.ai_name).toBe("하나"));

    act(() => {
      result.current.updatePending("persona", {
        ...result.current.current.persona,
        ai_name: "루나",
      });
      result.current.updatePending("outputMode", "bubble");
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(settingsApi.savePersona).toHaveBeenCalledWith(
      expect.objectContaining({ ai_name: "루나" })
    );
    expect(settingsApi.saveAutonomous).toHaveBeenCalled();
    expect(window.hanaDesktop.saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: expect.objectContaining({ outputMode: "bubble" }),
      })
    );
    expect(window.hanaDesktop.settingsSaved).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "dark-anime", autoLaunch: false })
    );
    expect(result.current.pending).toBeNull();
    expect(result.current.saved.persona.ai_name).toBe("루나");
  });

  test("handleCancel reverts live theme preview to saved theme", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.saved.theme).toBe("dark-anime"));

    act(() => {
      result.current.updatePending("theme", "glass");
      applyTheme("glass");
    });
    expect(document.body.className).toBe("theme-glass");

    act(() => {
      result.current.handleCancel();
    });
    expect(document.body.className).toBe("theme-dark-anime");
    expect(result.current.pending).toBeNull();
  });

  test("handleReset applies default settings into pending state", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.saved.theme).toBe("dark-anime"));

    act(() => {
      result.current.handleReset();
    });

    expect(result.current.pending).toEqual(DEFAULT_SETTINGS);
    expect(document.body.className).toBe("theme-dark-anime");
    expect(result.current.saved).not.toBeNull();
  });

  test("immediate character model selection calls API", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.currentModelId).toBe("furina"));

    await act(async () => {
      await result.current.selectCharacterModel("nanoka");
    });

    expect(settingsApi.selectModel).toHaveBeenCalledWith("nanoka");
    expect(result.current.currentModelId).toBe("nanoka");
  });
});
