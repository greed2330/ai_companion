import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChatWindow from "../components/ChatWindow";

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

describe("ChatWindow", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("renders input and send button, submits on Enter", async () => {
    fetch.mockResolvedValue(
      createSseResponse([
        'data: {"type":"token","content":"안"}\n',
        'data: {"type":"done","message_id":"m1","conversation_id":"c1","mood":"IDLE"}\n',
        "data: [DONE]\n"
      ])
    );

    render(<ChatWindow onMoodChange={jest.fn()} />);
    const input = screen.getByLabelText("message-input");
    fireEvent.change(input, { target: { value: "테스트" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "전송" })).toBeInTheDocument();
  });

  test("streams tokens and stops on [DONE]", async () => {
    fetch.mockResolvedValue(
      createSseResponse([
        'data: {"type":"token","content":"하"}\n',
        'data: {"type":"token","content":"나"}\n',
        'data: {"type":"done","message_id":"m2","conversation_id":"c2","mood":"HAPPY"}\n',
        "data: [DONE]\n"
      ])
    );

    const onMoodChange = jest.fn();
    render(<ChatWindow onMoodChange={onMoodChange} />);

    fireEvent.change(screen.getByLabelText("message-input"), {
      target: { value: "안녕" }
    });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    expect(await screen.findByText("하나")).toBeInTheDocument();
    await waitFor(() => expect(onMoodChange).toHaveBeenCalledWith("HAPPY"));
  });

  test("shows error message from SSE error event", async () => {
    fetch.mockResolvedValue(
      createSseResponse([
        'data: {"type":"error","code":"LLM_UNAVAILABLE","message":"Ollama 연결 실패"}\n'
      ])
    );

    render(<ChatWindow onMoodChange={jest.fn()} />);
    fireEvent.change(screen.getByLabelText("message-input"), {
      target: { value: "안녕" }
    });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ollama 연결 실패");
  });
});
