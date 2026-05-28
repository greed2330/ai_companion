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

  test("tts-start 이벤트 detail에 text 포함", async () => {
    fetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/wav" }))
    });
    const service = new TTSService();
    let capturedDetail = null;
    window.addEventListener("tts-start", (e) => { capturedDetail = e.detail; });

    await service.speak("오늘 날씨 어때?");

    expect(capturedDetail).toMatchObject({ text: "오늘 날씨 어때?" });
  });
});
