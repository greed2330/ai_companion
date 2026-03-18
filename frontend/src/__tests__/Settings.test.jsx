import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Settings from "../components/Settings";

jest.mock("../services/settings", () => ({
  fetchModels: jest.fn(),
  selectModel: jest.fn()
}));

const { fetchModels, selectModel } = jest.requireMock("../services/settings");

describe("Settings", () => {
  beforeEach(() => {
    fetchModels.mockResolvedValue({
      current: "nanoka",
      models: [
        {
          id: "nanoka",
          name: "Nanoka",
          path: "assets/character/nanoka/nanoka.model3.json"
        },
        {
          id: "furina",
          name: "Furina",
          path: "assets/character/furina/furina.pmx"
        }
      ]
    });
    selectModel.mockResolvedValue({ success: true, current: "furina" });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("renders model list with type badges", async () => {
    render(<Settings />);

    expect(await screen.findByText("Nanoka")).toBeInTheDocument();
    expect(screen.getByText("Live2D")).toBeInTheDocument();
    expect(screen.getByText("PMX")).toBeInTheDocument();
  });

  test("calls POST /settings/models/select on click", async () => {
    const onModelSelected = jest.fn();
    render(<Settings onModelSelected={onModelSelected} />);

    fireEvent.click(await screen.findByRole("button", { name: /Furina/i }));

    await waitFor(() => expect(selectModel).toHaveBeenCalledWith("furina"));
    expect(onModelSelected).toHaveBeenCalledWith("furina");
  });
});
