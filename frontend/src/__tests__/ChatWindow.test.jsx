import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChatWindow from "../components/ChatWindow";

jest.mock("../services/feedback", () => ({
  submitFeedback: jest.fn(() => Promise.resolve({ success: true }))
}));

jest.mock("../hooks/useMotionStream", () => ({
  useMotionStream: jest.fn()
}));

jest.mock("../services/stt", () => ({
  sttService: {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() =>
      Promise.resolve({ text: "음성 입력", audio_features: { energy: 0.5 } })
    )
  }
}));

const { sttService } = jest.requireMock("../services/stt");

function createSseResponse(chunks) {
  const encoder = new TextEncoder();
  const encoded = chunks.map((chunk) => encoder.encode(chunk));
  let index = 0;

  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= encoded.length) {
              return { done: true, value: undefined };
            }

            const value = encoded[index];
            index += 1;
            return { done: false, value };
          }
        };
      }
    }
  };
}

function renderChatWindow(props = {}) {
  return render(
    <ChatWindow
      autoRoom
      currentMood="IDLE"
      currentRoom="general"
      onAutoRoomChange={jest.fn()}
      onMoodChange={jest.fn()}
      onNewConversation={jest.fn()}
      onRoomChange={jest.fn()}
      onRoomEvent={jest.fn()}
      settings={{ inputMode: "text", outputMode: "chat" }}
      {...props}
    />
  );
}

describe("ChatWindow", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("renders input and send button, submits on Enter", async () => {
    fetch.mockResolvedValue(
      createSseResponse([
        'data: {"type":"token","content":"hi"}\n',
        'data: {"type":"done","message_id":"m1","conversation_id":"c1","mood":"IDLE"}\n',
        "data: [DONE]\n"
      ])
    );

    renderChatWindow();
    fireEvent.change(screen.getByLabelText("message-input"), {
      target: { value: "테스트" }
    });
    fireEvent.keyDown(screen.getByLabelText("message-input"), { key: "Enter" });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "전송" })).toBeInTheDocument();
  });

  test("sidebar opens and closes on outside click", () => {
    renderChatWindow();

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "sidebar-backdrop" }));
    expect(screen.queryByTestId("chat-sidebar")).not.toBeInTheDocument();
  });

  test("manual room select disables auto room", () => {
    const onAutoRoomChange = jest.fn();
    const onRoomChange = jest.fn();
    renderChatWindow({ onAutoRoomChange, onRoomChange });

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: /코딩/i }));

    expect(onRoomChange).toHaveBeenCalledWith("coding");
    expect(onAutoRoomChange).toHaveBeenCalledWith(false);
  });

  test("message autoscroll runs when a new message appears", async () => {
    const scrollIntoView = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    fetch.mockResolvedValue(
      createSseResponse([
        'data: {"type":"token","content":"hi"}\n',
        'data: {"type":"done","message_id":"m2","conversation_id":"c2","mood":"HAPPY"}\n',
        "data: [DONE]\n"
      ])
    );

    renderChatWindow();
    fireEvent.change(screen.getByLabelText("message-input"), {
      target: { value: "안녕" }
    });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  test("voice mode sends voice_mode:true", async () => {
    fetch.mockResolvedValue(
      createSseResponse([
        'data: {"type":"token","content":"hi"}\n',
        'data: {"type":"done","message_id":"m3","conversation_id":"c3","mood":"HAPPY"}\n',
        "data: [DONE]\n"
      ])
    );

    renderChatWindow({ settings: { inputMode: "voice", outputMode: "chat" } });
    fireEvent.change(screen.getByLabelText("message-input"), {
      target: { value: "voice test" }
    });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch.mock.calls[0][1].body).toContain('"voice_mode":true');
  });

  test("voice button records and toggles active style", async () => {
    renderChatWindow();

    fireEvent.click(screen.getByRole("button", { name: "voice-input" }));
    expect(sttService.start).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "voice-input" })).toHaveStyle(
      "animation: pulse 1s infinite"
    );
  });
});
