import { act, renderHook, waitFor } from "@testing-library/react";
import useSettings, { DEFAULT_SETTINGS } from "../hooks/useSettings";

jest.mock("../services/settings", () => ({
  fetchAutonomous: jest.fn(() =>
    Promise.resolve({
      proactive_chat: false,
      tip_bubbles: true,
      screen_reaction: true,
      schedule_reminder: false,
      auto_crawl: false
    })
  ),
  fetchLlmModels: jest.fn(() =>
    Promise.resolve({ current_chat_model: "qwen3:14b", models: [] })
  ),
  fetchModels: jest.fn(() =>
    Promise.resolve({ current: "furina", models: [{ id: "furina", type: "pmx" }] })
  ),
  fetchPersona: jest.fn(() =>
    Promise.resolve({
      ai_name: "하나",
      owner_nickname: "",
      speech_preset: "bright_friend",
      speech_style: "",
      personality_preset: "energetic",
      personality: "",
      interests: ""
    })
  ),
  saveAutonomous: jest.fn(() => Promise.resolve({ success: true })),
  savePersona: jest.fn(() => Promise.resolve({ success: true })),
  selectLlmModel: jest.fn(() => Promise.resolve({ success: true })),
  selectModel: jest.fn(() => Promise.resolve({ success: true }))
}));

const settingsApi = jest.requireMock("../services/settings");

describe("useSettings", () => {
  test("confirm saves persona and output mode", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.saved).not.toBeNull());

    act(() => {
      result.current.updatePending("persona", { ai_name: "루나" });
      result.current.updatePending("voice", { outputMode: "bubble" });
    });
    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(settingsApi.savePersona).toHaveBeenCalledWith(
      expect.objectContaining({ ai_name: "루나" })
    );
    expect(window.hanaDesktop.saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: expect.objectContaining({ outputMode: "bubble" })
      })
    );
  });

  test("cancel rolls theme back to saved value", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.saved).not.toBeNull());

    act(() => {
      result.current.handleThemeChange("glass");
    });
    expect(document.body.className).toBe("theme-glass");

    act(() => {
      result.current.handleCancel();
    });
    expect(document.body.className).toBe("theme-dark-anime");
  });

  test("reset applies default settings", async () => {
    window.confirm = jest.fn(() => true);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.saved).not.toBeNull());

    await act(async () => {
      await result.current.handleReset();
    });

    expect(result.current.saved).toEqual(DEFAULT_SETTINGS);
  });
});
