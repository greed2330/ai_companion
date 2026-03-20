import { act, render, screen } from "@testing-library/react";
import SpeechBubble, {
  BUBBLE_TYPES
} from "../components/bubble/SpeechBubble";

describe("SpeechBubble", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test("uses the correct color for the current mood", () => {
    render(<SpeechBubble message="hello" mood="HAPPY" visible />);

    expect(screen.getByTestId("speech-bubble")).toHaveStyle({
      backgroundColor: "#f5a623"
    });
  });

  test("falls back to alert style when capture bubble has no image", () => {
    render(
      <SpeechBubble
        message="watch out"
        mood="CONCERNED"
        type={BUBBLE_TYPES.CAPTURE}
        visible
      />
    );

    expect(screen.getByTestId("speech-bubble")).toHaveClass(
      "speech-bubble--alert"
    );
  });

  test("auto-hides after 4 seconds via IPC", () => {
    render(<SpeechBubble message="hello" mood="IDLE" visible />);

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(window.hanaDesktop.hideBubble).toHaveBeenCalled();
  });
});
