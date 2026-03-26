import { lipSyncService } from "../services/lipsync";

describe("LipSyncService", () => {
  afterEach(() => {
    jest.clearAllMocks();
    lipSyncService.stop();
    delete window.__characterRenderer;
  });

  test("starts lip sync on tts-start event", () => {
    const startSpy = jest.spyOn(lipSyncService, "start");
    window.__characterRenderer = { setAbstractParam: jest.fn() };

    window.dispatchEvent(
      new CustomEvent("tts-start", { detail: { audio: null, params: {} } })
    );

    expect(startSpy).toHaveBeenCalled();
  });

  test("stops lip sync on tts-end and resets mouth_open", () => {
    const renderer = { setAbstractParam: jest.fn() };
    window.__characterRenderer = renderer;

    window.dispatchEvent(
      new CustomEvent("tts-start", { detail: { audio: null, params: {} } })
    );
    window.dispatchEvent(new CustomEvent("tts-end"));

    expect(renderer.setAbstractParam).toHaveBeenCalledWith("mouth_open", 0);
  });
});
