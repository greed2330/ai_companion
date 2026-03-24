import { STTService } from "../services/stt";

describe("STTService", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("records text and returns backend transcription", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "안녕" })
    });

    const service = new STTService();
    service._features = jest.fn(() =>
      Promise.resolve({ energy: 0.5, speech_rate: 0.8, rising_tone: false })
    );
    await service.start();
    const result = await service.stop();

    expect(result.text).toBe("안녕");
    expect(result.audio_features).toEqual(
      expect.objectContaining({
        energy: expect.any(Number),
        speech_rate: expect.any(Number),
        rising_tone: expect.any(Boolean)
      })
    );
  });

  test("uses Web Speech fallback when backend is unavailable", async () => {
    fetch.mockRejectedValue(new Error("offline"));

    const service = new STTService();
    await service.start();
    const result = await service.stop();

    expect(result.text).toBe("테스트 음성");
    expect(result.audio_features).toBeNull();
  });
});
