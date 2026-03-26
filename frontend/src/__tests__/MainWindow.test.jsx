import { act, fireEvent, render, screen } from "@testing-library/react";
import MainWindow from "../pages/MainWindow";

jest.mock("../hooks/useMoodStream", () => jest.fn());
jest.mock("../hooks/useConversations", () => jest.fn());
jest.mock("../hooks/useChat", () => jest.fn());
jest.mock("../hooks/useSettings", () =>
  jest.fn(() => ({
    current: {
      persona: { ai_name: "하나", owner_nickname: "" },
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
      viewportOpacity: 85,
    },
    saved: null,
    pending: null,
    models: [],
    currentModelId: "",
    llmModels: [],
    currentLlmModelId: "",
    previewSamples: [],
    updatePending: jest.fn(),
    handleCancel: jest.fn(),
    handleReset: jest.fn(),
    handleSave: jest.fn(),
    previewPersona: jest.fn(),
    selectCharacterModel: jest.fn(),
    selectLlmModel: jest.fn(),
    setPreviewSamples: jest.fn(),
  }))
);

const useMoodStream = jest.requireMock("../hooks/useMoodStream");
const useConversations = jest.requireMock("../hooks/useConversations");
const useChat = jest.requireMock("../hooks/useChat");

describe("MainWindow", () => {
  beforeEach(() => {
    useMoodStream.mockImplementation(({ onRoomChange }) => {
      window.__roomChangeHandler = onRoomChange;
      return { mode: "stream" };
    });
    useConversations.mockReturnValue({
      conversations: [
        {
          id: "conv-1",
          title: "첫 대화",
          preview: "마지막 메시지",
          started_at: new Date().toISOString(),
          roomType: "일반",
        },
      ],
      groupedConversations: {
        오늘: [
          {
            id: "conv-1",
            title: "첫 대화",
            preview: "마지막 메시지",
            started_at: new Date().toISOString(),
            roomType: "일반",
          },
        ],
        어제: [],
        "지난 7일": [],
        "더 이전": [],
      },
      refreshConversations: jest.fn(),
    });
    useChat.mockReturnValue({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "기존 대화 유지",
          created_at: "2026-03-25T10:00:00.000Z",
        },
      ],
      isStreaming: false,
      sendMessage: jest.fn(),
      submitFeedback: jest.fn(),
      clearMessages: jest.fn(),
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

  test("IPC set-tab switches to settings tab", () => {
    render(<MainWindow />);

    act(() => {
      window.__setTabHandler("settings");
    });

    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-layout")).not.toBeInTheDocument();
  });

  test("tab switch preserves chat state", () => {
    const { container } = render(<MainWindow />);
    const tabs = container.querySelectorAll(".tab-bar .tab");

    expect(screen.getByText("기존 대화 유지")).toBeInTheDocument();

    fireEvent.click(tabs[1]);
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();

    fireEvent.click(tabs[0]);
    expect(screen.getByTestId("chat-layout")).toBeInTheDocument();
    expect(screen.getByText("기존 대화 유지")).toBeInTheDocument();
  });

  test("room_change event updates room badge", () => {
    render(<MainWindow />);

    act(() => {
      window.__roomChangeHandler({ room_type: "코딩" });
    });

    expect(screen.getByText("코딩")).toBeInTheDocument();
  });
});
