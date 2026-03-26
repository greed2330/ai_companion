import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CharacterOverlay, {
  detectModelType
} from "../components/CharacterOverlay";

jest.mock("../components/characterRenderer", () => ({
  applyGaze: jest.fn(),
  applyMood: jest.fn(),
  detectModelType: jest.fn((modelPath) => {
    if (modelPath.endsWith(".model3.json")) {
      return "live2d";
    }

    if (modelPath.endsWith(".pmx")) {
      return "pmx";
    }

    return null;
  }),
  loadCharacterModel: jest.fn(() =>
    Promise.resolve({
      cleanup: jest.fn(),
      type: "live2d"
    })
  )
}));

jest.mock("../services/characterController", () => ({
  characterController: {
    detach: jest.fn(),
    init: jest.fn(() => Promise.resolve())
  }
}));

const {
  applyMood,
  loadCharacterModel
} = jest.requireMock("../components/characterRenderer");

describe("CharacterOverlay", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("renders placeholder when no model file is present", () => {
    render(<CharacterOverlay mood="IDLE" modelPath="" />);
    expect(screen.getByText("하나")).toBeInTheDocument();
  });

  test("detects Live2D vs PMX correctly from path", () => {
    expect(detectModelType("assets/character/nanoka/nanoka.model3.json")).toBe(
      "live2d"
    );
    expect(detectModelType("assets/character/furina/furina.pmx")).toBe("pmx");
  });

  test("mood changes do not remount the character model", async () => {
    const { rerender } = render(
      <CharacterOverlay
        mood="IDLE"
        modelId="hana"
        modelPath="assets/character/hana/hana.model3.json"
      />
    );

    await waitFor(() => expect(loadCharacterModel).toHaveBeenCalledTimes(1));
    rerender(
      <CharacterOverlay
        mood="HAPPY"
        modelId="hana"
        modelPath="assets/character/hana/hana.model3.json"
      />
    );

    expect(loadCharacterModel).toHaveBeenCalledTimes(1);
    expect(applyMood).toHaveBeenCalledWith(expect.anything(), "HAPPY");
  });

  test("opens custom context menu on right click without dragging", async () => {
    render(<CharacterOverlay mood="IDLE" modelPath="" />);
    const overlay = screen.getByTestId("character-overlay");

    fireEvent.mouseDown(overlay, {
      button: 2,
      clientX: 32,
      clientY: 48,
      screenX: 132,
      screenY: 148
    });
    fireEvent.mouseUp(overlay, {
      button: 2,
      clientX: 32,
      clientY: 48,
      screenX: 132,
      screenY: 148
    });

    expect(await screen.findByRole("button", { name: /채팅 열기/i })).toBeInTheDocument();
  });
});
