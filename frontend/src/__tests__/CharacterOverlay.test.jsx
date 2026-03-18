import { render, screen } from "@testing-library/react";
import CharacterOverlay, {
  detectModelType
} from "../components/CharacterOverlay";

describe("CharacterOverlay", () => {
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
});
