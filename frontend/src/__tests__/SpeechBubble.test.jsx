import { act, render, screen } from "@testing-library/react";
import SpeechBubble from "../components/SpeechBubble";

describe("SpeechBubble", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("uses the correct color for the current mood", () => {
    render(
      <SpeechBubble message="hello" mood="HAPPY" visible />
    );

    expect(screen.getByTestId("speech-bubble")).toHaveStyle({
      backgroundColor: "#f5c842"
    });
  });

  test("auto-hides after 4 seconds", () => {
    render(<SpeechBubble message="hello" mood="IDLE" visible />);
    expect(screen.getByTestId("speech-bubble")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.queryByTestId("speech-bubble")).not.toBeInTheDocument();
  });
});
