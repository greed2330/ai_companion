import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MainWindow from "../pages/MainWindow";

jest.mock("../hooks/useMoodStream", () => jest.fn());
jest.mock("../hooks/useAfkDetection", () => jest.fn());
jest.mock("../hooks/useSettings", () =>
  jest.fn(() => ({
    effective: {
      persona: { ai_name: "하나" },
      voice: { inputMode: "text", outputMode: "chat" },
      autonomous: {
        background_search: false,
        crawl_learning: false,
        proactive_chat: false,
        screen_reaction: true,
        terminal_access: false,
        document_link: false,
        search_limit: 10
      },
      integrations: {
        serper: { status: "grey", apiKey: "" },
        google_calendar: { status: "grey", apiKey: "" },
        github: { status: "grey", apiKey: "" }
      },
      character: { modelId: "furina", modelType: "PMX", viewportScale: 100 },
      aiModel: { chatModelId: "qwen3:14b", status: "연결됨" },
      app: { theme: "dark-anime", shortcut: "Alt+H", autoLaunch: false }
    },
    error: "",
    handleCancel: jest.fn(),
    handleConfirm: jest.fn(),
    handleReset: jest.fn(),
    handleThemeChange: jest.fn(),
    meta: {
      characterModels: [],
      llmModels: [],
      previewSamples: [],
      integrationState: {}
    },
    setError: jest.fn(),
    setMeta: jest.fn(),
    updatePending: jest.fn()
  }))
);

const useMoodStream = jest.requireMock("../hooks/useMoodStream");

describe("MainWindow", () => {
  beforeEach(() => {
    useMoodStream.mockImplementation(({ onRoomChange }) => {
      window.__roomChangeHandler = onRoomChange;
      return { mode: "stream" };
    });
    window.hanaDesktop.onSetTab.mockImplementation((callback) => {
      window.__setTabHandler = callback;
      return () => {
        window.__setTabHandler = null;
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.__roomChangeHandler = null;
    window.__setTabHandler = null;
  });

  test("IPC set-tab switches to settings tab", async () => {
    render(<MainWindow />);

    act(() => {
      window.__setTabHandler("settings");
    });
    expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
  });

  test("room_change event updates current room and shows bubble", async () => {
    render(<MainWindow />);

    act(() => {
      window.__roomChangeHandler({
        room_type: "coding",
        message: "코딩 대화로 바꿀게~"
      });
    });

    await waitFor(() =>
      expect(screen.getByText("코딩")).toBeInTheDocument()
    );
    expect(window.hanaDesktop.showBubble).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "코딩 대화로 바꿀게~",
        mood: "CURIOUS",
        type: "alert"
      })
    );
  });

  test("manual room override ignores later auto room changes", async () => {
    render(<MainWindow />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: /코딩/i }));

    act(() => {
      window.__roomChangeHandler({
        room_type: "game",
        message: "게임 대화로 바꿀게~"
      });
    });

    await waitFor(() =>
      expect(screen.getByText("코딩")).toBeInTheDocument()
    );
    expect(screen.queryByText("게임")).not.toBeInTheDocument();
  });
});
