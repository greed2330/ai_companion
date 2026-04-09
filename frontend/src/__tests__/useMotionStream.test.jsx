import { act, renderHook } from "@testing-library/react";
import { useMotionStream } from "../hooks/useMotionStream";

jest.mock("../services/characterController", () => ({
  characterController: {
    playMotionSequence: jest.fn(() => Promise.resolve()),
    returnToDefault: jest.fn(() => Promise.resolve()),
    showOverlayEffect: jest.fn(),
    enterSilentPresence: jest.fn(),
    exitSilentPresence: jest.fn(),
    startIdleBreathing: jest.fn()
  }
}));

const { characterController } = jest.requireMock("../services/characterController");

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.close = jest.fn();
    MockEventSource.instances.push(this);
  }
}

describe("useMotionStream", () => {
  beforeEach(() => {
    global.EventSource = MockEventSource;
    MockEventSource.instances = [];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("applies motion sequence on emotion_update", async () => {
    renderHook(() => useMotionStream("c1"));

    await act(async () => {
      await MockEventSource.instances[0].onmessage({
        data: JSON.stringify({
          type: "emotion_update",
          motion_sequence: [{ abstract: "head_x", value: 15 }],
          tension_level: 0.8
        })
      });
    });

    expect(characterController.playMotionSequence).toHaveBeenCalledWith(
      [{ abstract: "head_x", value: 15 }],
      0.8
    );
  });

  test("enters silent presence on focused mood", () => {
    renderHook(() => useMotionStream("c1"));

    act(() => {
      MockEventSource.instances[0].onmessage({
        data: JSON.stringify({ type: "mood_change", mood: "FOCUSED" })
      });
    });

    expect(characterController.enterSilentPresence).toHaveBeenCalled();
  });

  test("exits silent presence on non-focused mood", () => {
    renderHook(() => useMotionStream("c1"));

    act(() => {
      MockEventSource.instances[0].onmessage({
        data: JSON.stringify({ type: "mood_change", mood: "HAPPY" })
      });
    });

    expect(characterController.exitSilentPresence).toHaveBeenCalled();
    expect(characterController.startIdleBreathing).toHaveBeenCalled();
  });
});
