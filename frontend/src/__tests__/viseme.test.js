import { buildVisemeSchedule } from "../services/viseme";

describe("buildVisemeSchedule", () => {
  test("빈 텍스트 → 빈 배열", () => {
    expect(buildVisemeSchedule("", 1000)).toEqual([]);
  });

  test("공백/구두점만 있는 텍스트 → 빈 배열", () => {
    expect(buildVisemeSchedule("   !?.", 1000)).toEqual([]);
  });

  test("단일 한국어 음절 → 5 프레임 (keyframe 4 + terminal 1)", () => {
    const frames = buildVisemeSchedule("가", 1000);
    expect(frames.length).toBe(5);
  });

  test("ㅏ 모음 피크값 0.90", () => {
    const frames = buildVisemeSchedule("가", 1000);
    const peaks = frames.filter((f) => f.openValue === 0.90);
    expect(peaks.length).toBe(1);
    expect(peaks[0].timeMs).toBeCloseTo(200); // 20% of 1000ms
  });

  test("종성 있는 음절(안) → tail openValue 0.05", () => {
    const frames = buildVisemeSchedule("안", 1000);
    // 75% 지점 = 750ms
    const tailFrame = frames.find((f) => Math.abs(f.timeMs - 750) < 1);
    expect(tailFrame?.openValue).toBe(0.05);
  });

  test("종성 없는 음절(아) → tail openValue 0.10", () => {
    const frames = buildVisemeSchedule("아", 1000);
    const tailFrame = frames.find((f) => Math.abs(f.timeMs - 750) < 1);
    expect(tailFrame?.openValue).toBe(0.10);
  });

  test("3음절 가나다 → 13 프레임 (4*3 + 1), 피크 3개", () => {
    const frames = buildVisemeSchedule("가나다", 3000);
    expect(frames.length).toBe(13);
    const peaks = frames.filter((f) => f.openValue === 0.90);
    expect(peaks.length).toBe(3);
  });

  test("3음절 피크 타이밍이 각 음절 20% 지점에 위치", () => {
    const frames = buildVisemeSchedule("가나다", 3000);
    const peaks = frames.filter((f) => f.openValue === 0.90);
    expect(peaks[0].timeMs).toBeCloseTo(200);   // 0ms + 20%
    expect(peaks[1].timeMs).toBeCloseTo(1200);  // 1000ms + 20%
    expect(peaks[2].timeMs).toBeCloseTo(2200);  // 2000ms + 20%
  });

  test("terminal 프레임: timeMs === durationMs, openValue === 0", () => {
    const frames = buildVisemeSchedule("하나", 2000);
    const last = frames[frames.length - 1];
    expect(last.timeMs).toBe(2000);
    expect(last.openValue).toBe(0);
  });

  test("프레임 timeMs 오름차순 정렬", () => {
    const frames = buildVisemeSchedule("하나야", 3000);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].timeMs).toBeGreaterThanOrEqual(frames[i - 1].timeMs);
    }
  });

  test("영어/숫자 → 피크 0.40", () => {
    const frames = buildVisemeSchedule("abc", 3000);
    const peaks = frames.filter((f) => f.openValue === 0.40);
    expect(peaks.length).toBe(3);
  });

  test("ㅡ 모음(으) → 피크 0.30", () => {
    const frames = buildVisemeSchedule("으", 1000);
    const peaks = frames.filter((f) => f.openValue === 0.30);
    expect(peaks.length).toBe(1);
  });
});
