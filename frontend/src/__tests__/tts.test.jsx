import { TTSService } from "../services/tts";

describe("TTSService", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("falls back to SpeechSynthesis when backend is unavailable", async () => {
    fetch.mockRejectedValue(new Error("offline"));
    const service = new TTSService();

    await service.speak("안녕", { speed: 0.9 });

    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  test("dispatches tts-start when playback begins", async () => {
    fetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/wav" }))
    });
    const service = new TTSService();
    const listener = jest.fn();
    window.addEventListener("tts-start", listener);

    await service.speak("안녕");

    expect(listener).toHaveBeenCalled();
    window.removeEventListener("tts-start", listener);
  });
});
