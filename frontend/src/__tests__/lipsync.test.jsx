import { lipSyncService } from "../services/lipsync";

describe("LipSyncService", () => {
  let postMessageSpy;

  beforeEach(() => {
    postMessageSpy = jest.spyOn(BroadcastChannel.prototype, "postMessage");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    lipSyncService.stop();
  });

  test("text 없는 tts-start → start(amplitude) 경로 호출", () => {
    const startSpy = jest.spyOn(lipSyncService, "start");

    window.dispatchEvent(
      new CustomEvent("tts-start", { detail: { audio: null, params: {} } })
    );

    expect(startSpy).toHaveBeenCalled();
  });

  test("text 있는 tts-start → startWithText 경로 호출", () => {
    const startWithTextSpy = jest.spyOn(lipSyncService, "startWithText");

    window.dispatchEvent(
      new CustomEvent("tts-start", { detail: { audio: null, text: "안녕" } })
    );

    expect(startWithTextSpy).toHaveBeenCalledWith(null, "안녕");
  });

  test("stop → lipsync_value 0 BroadcastChannel 전송", () => {
    window.dispatchEvent(
      new CustomEvent("tts-start", { detail: { audio: null, params: {} } })
    );
    window.dispatchEvent(new CustomEvent("tts-end"));

    expect(postMessageSpy).toHaveBeenCalledWith({
      type: "lipsync_value",
      value: 0,
    });
  });

  test("startWithText(null, text) → _dummy 경로 (audio 없음)", () => {
    const dummySpy = jest.spyOn(lipSyncService, "_dummy");
    lipSyncService.startWithText(null, "안녕");
    expect(dummySpy).toHaveBeenCalled();
  });

  test("startWithText → _runSchedule 호출 (audio.duration > 0, 한국어 텍스트)", () => {
    const runScheduleSpy = jest.spyOn(lipSyncService, "_runSchedule");
    const mockAudio = { duration: 2, ended: false, currentTime: 0 };
    lipSyncService.startWithText(mockAudio, "안녕하세요");
    expect(runScheduleSpy).toHaveBeenCalledWith(mockAudio);
  });
});
