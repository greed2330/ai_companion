import { act, renderHook, waitFor } from "@testing-library/react";
import useAfkDetection from "../hooks/useAfkDetection";

jest.mock("../services/proactive", () => ({
  checkProactiveEvent: jest.fn(),
  postProactiveIgnored: jest.fn()
}));

const {
  checkProactiveEvent
} = jest.requireMock("../services/proactive");

describe("useAfkDetection", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    checkProactiveEvent.mockResolvedValue({
      can_trigger: true,
      log_id: "log-1"
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  test("10 minutes of inactivity sets SLEEPY mood and shows bubble", async () => {
    const setMood = jest.fn();
    renderHook(() => useAfkDetection({ setMood }));

    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000);
    });

    await waitFor(() => expect(checkProactiveEvent).toHaveBeenCalledWith("afk_sleepy"));
    expect(setMood).toHaveBeenCalledWith("SLEEPY");
    expect(window.hanaDesktop.showBubble).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "💤 ...zzz",
        mood: "SLEEPY",
        type: "think"
      })
    );
  });

  test("activity after AFK returns to IDLE with welcome bubble", async () => {
    const setMood = jest.fn();
    renderHook(() => useAfkDetection({ setMood }));

    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000);
    });
    await waitFor(() => expect(setMood).toHaveBeenCalledWith("SLEEPY"));

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove"));
    });

    expect(setMood).toHaveBeenCalledWith("IDLE");
    expect(window.hanaDesktop.showBubble).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "😊 어, 왔어?",
        mood: "HAPPY",
        type: "talk"
      })
    );
  });

  test("night reaction checks proactive endpoint", async () => {
    const RealDate = Date;
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length) {
          return new RealDate(...args);
        }

        return new RealDate("2026-03-24T23:00:00");
      }
    };

    renderHook(() => useAfkDetection({ setMood: jest.fn() }));

    await waitFor(() =>
      expect(checkProactiveEvent).toHaveBeenCalledWith("night_snack")
    );

    global.Date = RealDate;
  });
});
