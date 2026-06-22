import { buildVisemeSchedule, _tokenize, _T_SYL, _T_SPACE, _T_HARD, _T_SOFT } from "../services/viseme";

// ---------------------------------------------------------------------------
// 기존 테스트 — 공백 없는 텍스트는 동작이 동일하다
// ---------------------------------------------------------------------------
describe("buildVisemeSchedule — 기존 동작 (공백 없는 텍스트)", () => {
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

// ---------------------------------------------------------------------------
// 가중 단위 분배 — 수학적 검증
// ---------------------------------------------------------------------------
describe("buildVisemeSchedule — 가중 단위 분배 (띄어쓰기·구두점)", () => {
  // "가 나" : syl(가) SPACE syl(나) → totalUnits = 1 + 0.5 + 1 = 2.5
  // T=1000ms → msPerUnit=400ms, msSyl=400, msSpace=200
  // t=0: syl(가) → t+=400
  // t=400: SPACE frame, openValue=0 → t+=200
  // t=600: syl(나) → t+=400 → t=1000
  // terminal {1000,0}
  // 총 프레임: 4 + 1(space) + 4 + 1(terminal) = 10

  test("'가 나' → 공백 위치에 openValue=0 프레임 존재", () => {
    const frames = buildVisemeSchedule("가 나", 1000);
    // 공백 = 음절 두 번째가 끝난 직후(t=400)에 입이 닫힘
    const spaceFrame = frames.find((f) => Math.abs(f.timeMs - 400) < 1);
    expect(spaceFrame).toBeDefined();
    expect(spaceFrame.openValue).toBe(0);
  });

  test("'가 나' → 공백이 있으므로 '가나'보다 프레임 수가 많음", () => {
    const withSpace    = buildVisemeSchedule("가 나", 1000);
    const withoutSpace = buildVisemeSchedule("가나", 1000);
    expect(withSpace.length).toBeGreaterThan(withoutSpace.length);
  });

  test("'가 나' → 총 시간은 durationMs와 일치", () => {
    const frames = buildVisemeSchedule("가 나", 1000);
    expect(frames[frames.length - 1].timeMs).toBe(1000);
  });

  test("'가 나' — 두 번째 음절 피크는 공백 이후에 위치", () => {
    // msSyl=400, msSpace=200 → 두 번째 음절 시작=600, 피크=600+400*0.2=680
    const frames = buildVisemeSchedule("가 나", 1000);
    const peaks = frames.filter((f) => f.openValue === 0.90);
    expect(peaks.length).toBe(2);
    expect(peaks[1].timeMs).toBeCloseTo(680);
  });

  test("강한 구두점(.) → 공백보다 긴 정지 프레임", () => {
    // "가.나" : syl HARD syl → totalUnits=1+1.5+1=3.5, T=1000ms
    // msPerUnit≈285.7, msHard=1.5*285.7≈428.6ms
    // "가 나" : totalUnits=2.5, T=1000ms, msSpace=200ms
    // → HARD 정지(428ms) > SPACE 정지(200ms)
    const hardFrames  = buildVisemeSchedule("가.나",  1000);
    const spaceFrames = buildVisemeSchedule("가 나",  1000);

    const hardPause  = hardFrames.find( (f) => f.openValue === 0 && f.timeMs > 0 && f.timeMs < 999);
    const spacePause = spaceFrames.find((f) => f.openValue === 0 && f.timeMs > 0 && f.timeMs < 999);

    // 강한 구두점 이후 두 번째 음절 시작이 더 늦어야 한다
    const hardSecondPeak  = hardFrames.filter( (f) => f.openValue > 0.3 && f.timeMs > 100)[0];
    const spaceSecondPeak = spaceFrames.filter((f) => f.openValue > 0.3 && f.timeMs > 100)[0];
    expect(hardSecondPeak.timeMs).toBeGreaterThan(spaceSecondPeak.timeMs);
  });

  test("구두점 뒤 공백 → 공백 흡수 (이중 정지 없음)", () => {
    // "가. 나" 와 "가.나" 는 토큰 구성이 같아야 한다
    const withGap    = buildVisemeSchedule("가. 나", 1000);
    const withoutGap = buildVisemeSchedule("가.나",  1000);
    expect(withGap.length).toBe(withoutGap.length);
  });

  test("약한 구두점(,) → 공백보다 길고 강한 구두점보다 짧은 정지", () => {
    // K_SOFT=0.7 < K_SPACE... 아니, K_SPACE=0.5 < K_SOFT=0.7 < K_HARD=1.5
    // 두 번째 음절 시작 시각: space < soft < hard
    const withSpace = buildVisemeSchedule("가 나",  1000);
    const withSoft  = buildVisemeSchedule("가,나",  1000);
    const withHard  = buildVisemeSchedule("가.나",  1000);

    const secondPeak = (frames) =>
      frames.filter((f) => f.openValue > 0.3 && f.timeMs > 100)[0].timeMs;

    expect(secondPeak(withSpace)).toBeLessThan(secondPeak(withSoft));
    expect(secondPeak(withSoft)).toBeLessThan(secondPeak(withHard));
  });

  test("공백 포함 텍스트도 프레임 oㅒrdering 유지", () => {
    const frames = buildVisemeSchedule("오늘 날씨 어때", 3000);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].timeMs).toBeGreaterThanOrEqual(frames[i - 1].timeMs);
    }
  });
});

// ---------------------------------------------------------------------------
// _tokenize 단위 테스트
// ---------------------------------------------------------------------------
describe("_tokenize", () => {
  test("선행 공백 무시", () => {
    const tokens = _tokenize("  가");
    expect(tokens[0].type).toBe(_T_SYL);
  });

  test("연속 공백 → SPACE 토큰 1개", () => {
    const tokens = _tokenize("가   나");
    const spaces = tokens.filter((t) => t.type === _T_SPACE);
    expect(spaces.length).toBe(1);
  });

  test("구두점 뒤 공백 흡수", () => {
    const withGap    = _tokenize("가. 나");
    const withoutGap = _tokenize("가.나");
    expect(withGap.length).toBe(withoutGap.length);
    expect(withGap.map((t) => t.type)).toEqual(withoutGap.map((t) => t.type));
  });

  test("연속 같은 구두점 → HARD 토큰 1개", () => {
    const tokens = _tokenize("가!!나");
    const hards = tokens.filter((t) => t.type === _T_HARD);
    expect(hards.length).toBe(1);
  });

  test("'오늘 날씨 어때?' → SYL×6, SPACE×2, HARD×1", () => {
    const tokens = _tokenize("오늘 날씨 어때?");
    expect(tokens.filter((t) => t.type === _T_SYL  ).length).toBe(6);
    expect(tokens.filter((t) => t.type === _T_SPACE).length).toBe(2);
    expect(tokens.filter((t) => t.type === _T_HARD ).length).toBe(1);
  });
});
