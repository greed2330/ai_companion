import { render, screen } from "@testing-library/react";
import CharacterOverlay from "../components/CharacterOverlay";

test("renders and reflects mood prop", () => {
  render(<CharacterOverlay mood="FOCUSED" />);
  expect(screen.getByTestId("character-overlay")).toBeInTheDocument();
  expect(screen.getByLabelText("current-mood")).toHaveTextContent("FOCUSED");
});
