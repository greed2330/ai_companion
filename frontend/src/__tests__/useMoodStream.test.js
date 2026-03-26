import { act, renderHook, waitFor } from "@testing-library/react";
import useMoodStream from "../hooks/useMoodStream";

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.close = jest.fn();
    this.onmessage = null;
    this.onerror = null;
    MockEventSource.instances.push(this);
  }
}

describe("useMoodStream", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.EventSource = MockEventSource;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ mood: "FOCUSED" })
      })
    );
    MockEventSource.instances = [];
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  test("connects to /mood/stream and updates mood state on event", () => {
    const onMoodChange = jest.fn();

    renderHook(() =>
      useMoodStream({
        onMoodChange,
        onModelChange: jest.fn(),
        onRoomChange: jest.fn()
      })
    );

    expect(MockEventSource.instances[0].url).toBe("http://test/mood/stream");
    MockEventSource.instances[0].onmessage({
      data: JSON.stringify({ type: "mood_change", mood: "HAPPY" })
    });

    expect(onMoodChange).toHaveBeenCalledWith("HAPPY");
  });

  test("passes room_change events through", () => {
    const onRoomChange = jest.fn();

    renderHook(() =>
      useMoodStream({
        onMoodChange: jest.fn(),
        onModelChange: jest.fn(),
        onRoomChange
      })
    );

    MockEventSource.instances[0].onmessage({
      data: JSON.stringify({
        type: "room_change",
        room_type: "coding",
        message: "코딩 대화로 바꿀게~"
      })
    });

    expect(onRoomChange).toHaveBeenCalledWith(
      expect.objectContaining({
        room_type: "coding",
        message: "코딩 대화로 바꿀게~"
      })
    );
  });

  test("falls back to polling after 5 failures", async () => {
    const onMoodChange = jest.fn();
    const { result } = renderHook(() =>
      useMoodStream({
        onMoodChange,
        onModelChange: jest.fn(),
        onRoomChange: jest.fn()
      })
    );

    for (let index = 0; index < 5; index += 1) {
      act(() => {
        MockEventSource.instances[index].onerror();
        jest.advanceTimersByTime(3000);
      });
    }

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("http://test/mood"));
    await waitFor(() => expect(result.current.mode).toBe("polling"));
    expect(onMoodChange).toHaveBeenCalledWith("FOCUSED");
  });
});
