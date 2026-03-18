import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Settings from "../components/Settings";

jest.mock("../services/settings", () => ({
  fetchModels: jest.fn(),
  selectModel: jest.fn(),
  fetchLlmModels: jest.fn(),
  selectLlmModel: jest.fn()
}));

const {
  fetchModels,
  selectModel,
  fetchLlmModels,
  selectLlmModel
} = jest.requireMock("../services/settings");

describe("Settings", () => {
  beforeEach(() => {
    fetchModels.mockResolvedValue({
      current: "nanoka",
      models: [
        {
          id: "nanoka",
          name: "Nanoka",
          path: "assets/character/nanoka/nanoka.model3.json",
          type: "live2d"
        },
        {
          id: "furina",
          name: "Furina",
          path: "assets/character/furina/furina.pmx",
          type: "pmx"
        }
      ]
    });

    fetchLlmModels.mockResolvedValue({
      current_chat_model: "qwen3:14b",
      models: [
        { id: "qwen3:14b", name: "Qwen3 14B", role: "chat", current: true },
        { id: "qwen3:4b", name: "Qwen3 4B", role: "worker", current: false },
        { id: "qwen3-vl:8b", name: "Qwen3 Vl 8B", role: "vision", current: false }
      ]
    });

    selectModel.mockResolvedValue({ success: true, current: "furina" });
    selectLlmModel.mockResolvedValue({
      success: true,
      current_chat_model: "qwen3:14b"
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("renders model list with character type badges and llm role badges", async () => {
    render(<Settings />);

    expect(await screen.findByText("Nanoka")).toBeInTheDocument();
    expect(screen.getByText("Live2D")).toBeInTheDocument();
    expect(screen.getByText("PMX")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Worker")).toBeInTheDocument();
    expect(screen.getByText("Vision")).toBeInTheDocument();
  });

  test("calls POST /settings/models/select on character click", async () => {
    const onModelSelected = jest.fn();
    render(<Settings onModelSelected={onModelSelected} />);

    fireEvent.click(await screen.findByRole("button", { name: /Furina/i }));

    await waitFor(() => expect(selectModel).toHaveBeenCalledWith("furina"));
    expect(onModelSelected).toHaveBeenCalledWith("furina");
  });

  test("calls POST /settings/llm/select only for chat models", async () => {
    render(<Settings />);

    const workerButton = await screen.findByRole("button", { name: /Qwen3 4B/i });
    expect(workerButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Qwen3 14B/i }));

    await waitFor(() => expect(selectLlmModel).toHaveBeenCalledWith("qwen3:14b"));
  });
});
