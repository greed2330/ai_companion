import { lipSyncService } from "../services/lipsync";

describe("LipSyncService", () => {
  let postMessageSpy;

  beforeEach(() => {
    // lipsync.js는 모듈 로드 시 BroadcastChannel을 생성하므로
    // prototype에 spy를 걸어 postMessage 호출을 감지한다.
    postMessageSpy = jest.spyOn(BroadcastChannel.prototype, "postMessage");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    lipSyncService.stop();
  });

  test("starts lip sync on tts-start event", () => {
    const startSpy = jest.spyOn(lipSyncService, "start");

    window.dispatchEvent(
      new CustomEvent("tts-start", { detail: { audio: null, params: {} } })
    );

    expect(startSpy).toHaveBeenCalled();
  });

  test("stop sends lipsync_value 0 via BroadcastChannel", () => {
    // tts-start로 더미 모드 시작
    window.dispatchEvent(
      new CustomEvent("tts-start", { detail: { audio: null, params: {} } })
    );
    // tts-end로 stop() 호출
    window.dispatchEvent(new CustomEvent("tts-end"));

    // stop()이 {type:"lipsync_value", value:0}을 postMessage로 보내야 함
    expect(postMessageSpy).toHaveBeenCalledWith({
      type: "lipsync_value",
      value: 0,
    });
  });
});
