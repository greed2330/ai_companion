import {
  createPettingTracker,
  getClickZone,
  snapToEdge,
  TIPS
} from "../components/character/interactionUtils";

describe("character interaction utils", () => {
  test("click zone head", () => {
    expect(getClickZone(10, 100)).toBe("head");
  });

  test("click zone upper", () => {
    expect(getClickZone(40, 100)).toBe("upper");
  });

  test("click zone lower", () => {
    expect(getClickZone(80, 100)).toBe("lower");
  });

  test("petting detection triggers after 3 back-and-forth moves", () => {
    const onPetting = jest.fn();
    const tracker = createPettingTracker(onPetting);

    [4, -4, 4, -4, 4, -4].forEach((movementX) => {
      tracker.update({ movementX, zone: "head" });
    });

    expect(onPetting).toHaveBeenCalledTimes(1);
  });

  test("tip rotation uses 5 second cadence", () => {
    expect(TIPS).toHaveLength(8);
  });

  test("snap corner to screen edge", () => {
    expect(snapToEdge(10, 12, 300, 400, 1920, 1080)).toEqual({ x: 0, y: 0 });
  });
});
