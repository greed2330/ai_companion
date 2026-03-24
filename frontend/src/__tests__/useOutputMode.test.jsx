import { renderHook } from "@testing-library/react";
import { OUTPUT_MODES, detectBubbleType, getBubbleDuration } from "../constants/outputModes";
import { useOutputMode } from "../hooks/useOutputMode";

describe("useOutputMode", () => {
  test("outputMode=chat writes to chat only", async () => {
    const onChatText = jest.fn();
    const { result } = renderHook(() =>
      useOutputMode({ outputMode: OUTPUT_MODES.CHAT })
    );

    await result.current.handleResponse("안녕", "", {}, onChatText);
    expect(onChatText).toHaveBeenCalledWith("안녕");
    expect(window.hanaDesktop.showBubble).not.toHaveBeenCalled();
  });

  test("outputMode=bubble calls showBubble", async () => {
    const { result } = renderHook(() =>
      useOutputMode({ outputMode: OUTPUT_MODES.BUBBLE })
    );

    await result.current.handleResponse("안녕", "", {}, jest.fn());
    expect(window.hanaDesktop.showBubble).toHaveBeenCalled();
  });

  test("outputMode=voice calls ttsService", async () => {
    const ttsService = { speak: jest.fn() };
    const { result } = renderHook(() =>
      useOutputMode({ outputMode: OUTPUT_MODES.VOICE }, { ttsService })
    );

    await result.current.handleResponse("안녕", "", {}, jest.fn());
    expect(ttsService.speak).toHaveBeenCalledWith("안녕", {});
  });

  test("outputMode=bubble_voice calls both", async () => {
    const ttsService = { speak: jest.fn() };
    const { result } = renderHook(() =>
      useOutputMode({ outputMode: OUTPUT_MODES.BUBBLE_VOICE }, { ttsService })
    );

    await result.current.handleResponse("안녕", "", {}, jest.fn());
    expect(window.hanaDesktop.showBubble).toHaveBeenCalled();
    expect(ttsService.speak).toHaveBeenCalled();
  });

  test("bubble type helpers work", () => {
    expect(detectBubbleType("안녕", "proactive_comfort")).toBe("alert");
    expect(detectBubbleType("..생각 중", "")).toBe("think");
    expect(detectBubbleType("안녕", "")).toBe("talk");
  });

  test("bubble duration is clamped between short and long texts", () => {
    expect(getBubbleDuration("")).toBe(2000);
    expect(getBubbleDuration("x".repeat(200))).toBe(8000);
  });
});
