import { render, screen } from "@testing-library/react";
import Settings from "../components/Settings";

describe("Settings", () => {
  test("renders placeholder content for 05-C handoff", () => {
    render(<Settings />);

    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
    expect(
      screen.getByText("설정은 05-C에서 채워질 예정이야.")
    ).toBeInTheDocument();
  });
});
