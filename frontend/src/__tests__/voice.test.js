/**
 * 음성 서비스 (voice.js) 테스트.
 * fetch와 MediaRecorder는 mock으로 대체.
 */

import { transcribeBlob, speak } from "../services/voice";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// transcribeBlob
// ---------------------------------------------------------------------------

describe("transcribeBlob", () => {
  it("정상 응답 → text와 confidence 반환", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "안녕하세요", confidence: 0.95 })
    });

    const result = await transcribeBlob(new Blob(["fake"], { type: "audio/wav" }));
    expect(result.text).toBe("안녕하세요");
    expect(result.confidence).toBe(0.95);
  });

  it("/voice/stt 경로로 multipart/form-data 전송", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "테스트", confidence: 0.9 })
    });

    await transcribeBlob(new Blob(["x"], { type: "audio/wav" }));

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("/voice/stt");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("서버 에러 → Error throw", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: { message: "Whisper 없음" } })
    });

    await expect(transcribeBlob(new Blob(["x"]))).rejects.toThrow("Whisper 없음");
  });
});

// ---------------------------------------------------------------------------
// speak
// ---------------------------------------------------------------------------

describe("speak", () => {
  beforeEach(() => {
    // jsdom에는 URL.createObjectURL이 없어서 직접 할당
    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();

    // Audio mock — onended 설정 즉시 실행
    global.Audio = jest.fn().mockImplementation(() => ({
      play: jest.fn().mockResolvedValue(undefined),
      set onended(fn) { Promise.resolve().then(fn); },
      set onerror(_fn) {}
    }));
  });

  afterEach(() => {
    delete global.URL.createObjectURL;
    delete global.URL.revokeObjectURL;
  });

  it("정상 응답 → /voice/tts 호출, 오디오 재생 후 URL 해제", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["wav"], { type: "audio/wav" })
    });

    await speak("안녕!", { mood: "HAPPY" });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("/voice/tts");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.text).toBe("안녕!");
    expect(body.mood).toBe("HAPPY");
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("서버 에러 → Error throw", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: { message: "Kokoro 없음" } })
    });

    await expect(speak("테스트")).rejects.toThrow("Kokoro 없음");
  });
});
