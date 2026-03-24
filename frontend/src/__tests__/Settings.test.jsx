import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Settings from "../components/Settings";

jest.mock("../services/settings", () => ({
  previewPersona: jest.fn(() =>
    Promise.resolve({ samples: ["샘플 1", "샘플 2", "샘플 3"] })
  )
}));

function createSettingsState() {
  return {
    effective: {
      character: { modelId: "furina", modelType: "PMX", viewportScale: 100 },
      persona: {
        ai_name: "하나",
        owner_nickname: "",
        speech_preset: "bright_friend",
        speech_style: "",
        personality_preset: "energetic",
        personality: "",
        interests: ""
      },
      aiModel: { chatModelId: "qwen3:14b", status: "연결됨" },
      autonomous: {
        masterEnabled: false,
        background_search: false,
        crawl_learning: false,
        proactive_chat: false,
        screen_reaction: true,
        terminal_access: false,
        document_link: false,
        search_limit: 10
      },
      integrations: {
        serper: { status: "grey", apiKey: "sk-12345678" },
        google_calendar: { status: "grey", apiKey: "" },
        github: { status: "grey", apiKey: "ghp_12345678" }
      },
      voice: { inputMode: "text", outputMode: "chat", ttsEnabled: false },
      app: { theme: "dark-anime", shortcut: "Alt+H", autoLaunch: false }
    },
    error: "",
    handleCancel: jest.fn(),
    handleConfirm: jest.fn(),
    handleReset: jest.fn(),
    handleThemeChange: jest.fn((theme) => {
      document.body.className = `theme-${theme}`;
    }),
    meta: {
      characterModels: [
        { id: "furina", name: "Furina", type: "pmx" },
        { id: "nanoka", name: "Nanoka", type: "live2d" }
      ],
      llmModels: [{ id: "qwen3:14b", role: "chat" }],
      previewSamples: [],
      integrationState: {}
    },
    setError: jest.fn(),
    setMeta: jest.fn((updater) => {
      const next = updater({
        characterModels: [],
        llmModels: [],
        previewSamples: [],
        integrationState: {}
      });
      createSettingsState.meta = next;
    }),
    updatePending: jest.fn()
  };
}

describe("Settings", () => {
  test("accordion toggles section body", () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);

    expect(screen.getByLabelText("character-model")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "캐릭터" }));
    expect(screen.queryByLabelText("character-model")).not.toBeInTheDocument();
  });

  test("confirm button delegates to handler", () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);

    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(state.handleConfirm).toHaveBeenCalled();
  });

  test("serper dependency disables background search", async () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);

    fireEvent.click(screen.getByRole("button", { name: "자율 행동" }));
    expect(await screen.findByText("Serper API 연결 필요")).toBeInTheDocument();
  });

  test("api key is masked by default and toggles visible", async () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);

    fireEvent.click(screen.getByRole("button", { name: "외부 연동" }));
    const input = await screen.findByLabelText("serper-key");
    expect(input).toHaveValue("sk-1...5678");

    fireEvent.click(screen.getByRole("button", { name: "serper-toggle-visibility" }));
    expect(input).toHaveValue("sk-12345678");
  });

  test("integration test shows loading then fallback failure", async () => {
    const state = createSettingsState();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    render(<Settings settingsState={state} />);

    fireEvent.click(screen.getByRole("button", { name: "외부 연동" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "연결" }))[0]);

    await waitFor(() => expect(screen.getByText("서버 연결 실패")).toBeInTheDocument());
  });

  test("persona preview opens dialog with 3 samples", async () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);

    fireEvent.click(screen.getByRole("button", { name: "AI & 모델" }));
    fireEvent.click(await screen.findByRole("button", { name: "미리보기" }));

    await waitFor(() =>
      expect(state.setMeta).toHaveBeenCalled()
    );
  });
});
