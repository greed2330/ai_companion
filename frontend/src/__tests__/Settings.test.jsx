import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Settings from "../components/Settings";

jest.mock("../services/settings", () => ({
  previewPersona: jest.fn(() => Promise.resolve({ samples: ["sample 1", "sample 2", "sample 3"] }))
}));

function createSettingsState() {
  return {
    effective: {
      character: { modelId: "furina", modelType: "pmx", viewportScale: 100 },
      persona: {
        ai_name: "Hana",
        owner_nickname: "",
        speech_preset: "bright_friend",
        speech_style: "",
        personality_preset: "energetic",
        personality: "",
        interests: ""
      },
      aiModel: { chatModelId: "qwen3:14b", status: "connected" },
      autonomous: {
        masterEnabled: false,
        background_search: false,
        crawl_learning: false,
        proactive_chat: false,
        screen_reaction: true,
        terminal_access: false,
        document_link: false,
        search_limit: 10,
        tip_bubbles: true,
        schedule_reminder: false,
        auto_crawl: false
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
      const next = updater({ characterModels: [], llmModels: [], previewSamples: [], integrationState: {} });
      createSettingsState.meta = next;
    }),
    updatePending: jest.fn()
  };
}

describe("Settings", () => {
  test("section nav switches visible detail panel", () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);

    expect(screen.getByLabelText("character-model-select")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /AI & Persona/ }));
    expect(screen.getByLabelText("chat-model-select")).toBeInTheDocument();
    expect(screen.queryByLabelText("character-model-select")).not.toBeInTheDocument();
  });

  test("confirm button delegates to handler", () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(state.handleConfirm).toHaveBeenCalled();
  });

  test("serper dependency warning is shown in autonomy section", () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);
    fireEvent.click(screen.getByRole("button", { name: /Autonomy/ }));
    expect(screen.getByText("Serper API connection is required for background search.")).toBeInTheDocument();
  });

  test("api key is masked by default and toggles visible", () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);
    fireEvent.click(screen.getByRole("button", { name: /Integrations/ }));
    expect(screen.getByLabelText("serper-key")).toHaveValue("sk-1...5678");
    fireEvent.click(screen.getByRole("button", { name: "serper-toggle-visibility" }));
    expect(screen.getByLabelText("serper-key")).toHaveValue("sk-12345678");
  });

  test("integration test shows fallback failure", async () => {
    const state = createSettingsState();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    render(<Settings settingsState={state} />);
    fireEvent.click(screen.getByRole("button", { name: /Integrations/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[0]);
    await waitFor(() =>
      expect(screen.getAllByText("Server request failed").length).toBeGreaterThan(0)
    );
  });

  test("persona preview triggers preview fetch", async () => {
    const state = createSettingsState();
    render(<Settings settingsState={state} />);
    fireEvent.click(screen.getByRole("button", { name: /AI & Persona/ }));
    fireEvent.click(screen.getByRole("button", { name: "Preview persona" }));
    await waitFor(() => expect(state.setMeta).toHaveBeenCalled());
  });
});
