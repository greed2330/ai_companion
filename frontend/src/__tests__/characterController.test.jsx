import { characterController, CharacterController } from "../services/characterController";

describe("CharacterController", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    global.requestAnimationFrame = jest.fn((callback) =>
      setTimeout(() => callback(performance.now() + 500), 0)
    );
    global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));
    document.body.innerHTML = '<div class="character-stage"></div>';
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
    characterController.detach();
    document.body.innerHTML = "";
  });

  function createLive2dRenderer() {
    return {
      type: "live2d",
      model: {
        internalModel: {
          coreModel: {
            setParameterValueById: jest.fn()
          }
        }
      }
    };
  }

  test("maps abstract params to live2d params", async () => {
    const controller = new CharacterController();
    const renderer = createLive2dRenderer();
    await controller.init(renderer, "hana");

    controller.setAbstractParam("head_x", 15);

    expect(
      renderer.model.internalModel.coreModel.setParameterValueById
    ).toHaveBeenCalledWith("ParamAngleX", 15);
  });

  test("skips missing abstract params without error", async () => {
    const controller = new CharacterController();
    await controller.init(createLive2dRenderer(), "hana");

    expect(() => controller.setAbstractParam("unknown", 1)).not.toThrow();
  });

  test("clamps values to param range", async () => {
    const controller = new CharacterController();
    const renderer = createLive2dRenderer();
    await controller.init(renderer, "hana");

    controller.setAbstractParam("head_x", 50);

    expect(
      renderer.model.internalModel.coreModel.setParameterValueById
    ).toHaveBeenLastCalledWith("ParamAngleX", 30);
  });

  test("plays motion sequence with step objects", async () => {
    const controller = new CharacterController();
    const tweenSpy = jest.spyOn(controller, "_tween").mockResolvedValue();
    await controller.init(createLive2dRenderer(), "hana");

    await controller.playMotionSequence([
      { abstract: "head_x", value: 15, duration: 300 }
    ]);

    expect(tweenSpy).toHaveBeenCalledWith("head_x", 15, 300, "ease_out");
  });

  test("expands string motion names via MOTION_PRESETS", async () => {
    const controller = new CharacterController();
    const tweenSpy = jest.spyOn(controller, "_tween").mockResolvedValue();
    await controller.init(createLive2dRenderer(), "hana");

    // "bounce" → [{abstract:"head_y",...},{abstract:"body_y",...}]
    await controller.playMotionSequence(["bounce"], 1);

    expect(tweenSpy).toHaveBeenCalledWith("head_y", expect.any(Number), 200, "ease_out");
  });

  test("ignores unknown string motion names without error", async () => {
    const controller = new CharacterController();
    const tweenSpy = jest.spyOn(controller, "_tween").mockResolvedValue();
    await controller.init(createLive2dRenderer(), "hana");

    await expect(
      controller.playMotionSequence(["nonexistent_motion"])
    ).resolves.toBeUndefined();
    expect(tweenSpy).not.toHaveBeenCalled();
  });

  test("handles mixed string and object steps", async () => {
    const controller = new CharacterController();
    const tweenSpy = jest.spyOn(controller, "_tween").mockResolvedValue();
    await controller.init(createLive2dRenderer(), "hana");

    await controller.playMotionSequence([
      "nod",
      { abstract: "smile", value: 0.5, duration: 200 }
    ]);

    // "nod" expands to head_y step; "smile" is a direct step
    expect(tweenSpy).toHaveBeenCalledWith("head_y", expect.any(Number), 300, "ease_in_out");
    expect(tweenSpy).toHaveBeenCalledWith("smile", 0.5, 200, "ease_out");
  });

  test("applies tension level to motion sequence", async () => {
    const controller = new CharacterController();
    const tweenSpy = jest.spyOn(controller, "_tween").mockResolvedValue();
    await controller.init(createLive2dRenderer(), "hana");

    await controller.playMotionSequence(
      [{ abstract: "gaze_x", value: 1, duration: 300 }],
      0.5
    );

    expect(tweenSpy).toHaveBeenCalledWith("gaze_x", 0.5, 300, "ease_out");
  });

  test("respects motion delay", async () => {
    const controller = new CharacterController();
    const tweenSpy = jest.spyOn(controller, "_tween").mockResolvedValue();
    await controller.init(createLive2dRenderer(), "hana");

    const promise = controller.playMotionSequence([
      { abstract: "head_x", value: 15, delay: 500 }
    ]);

    jest.advanceTimersByTime(499);
    expect(tweenSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await promise;
    expect(tweenSpy).toHaveBeenCalled();
  });

  test("returns parameters to default values", async () => {
    const controller = new CharacterController();
    const tweenSpy = jest.spyOn(controller, "_tween").mockResolvedValue();
    await controller.init(createLive2dRenderer(), "hana");

    controller.currentValues.ParamAngleX = 15;
    await controller.returnToDefault(800);

    expect(tweenSpy).toHaveBeenCalledWith("head_x", 0, 800, "ease_out");
  });

  test("renders overlay effect in the DOM", () => {
    characterController.showOverlayEffect("question_mark");
    expect(document.querySelector(".character-overlay-effect")).toBeInTheDocument();
  });

  test("enters and exits silent presence", async () => {
    const controller = new CharacterController();
    const pmxRenderer = {
      type: "pmx",
      model: { position: { y: 0 }, morphTargetDictionary: {}, morphTargetInfluences: [] }
    };
    await controller.init(pmxRenderer, "furina");

    controller.enterSilentPresence();
    expect(controller._silentMode).toBe(true);
    controller.exitSilentPresence();
    expect(controller._silentMode).toBe(false);
  });

  test("does not create duplicate silent presence loops", async () => {
    const controller = new CharacterController();
    await controller.init(
      {
        type: "pmx",
        model: { position: { y: 0 }, morphTargetDictionary: {}, morphTargetInfluences: [] }
      },
      "furina"
    );

    controller.enterSilentPresence();
    const firstFrame = controller._silentFrame;
    controller.enterSilentPresence();

    expect(controller._silentFrame).toBe(firstFrame);
  });
});
