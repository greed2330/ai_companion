/**
 * 한국어 텍스트 → viseme 프레임 배열 변환.
 * 오디오 분석 없이 유니코드 산술로 음절을 분해하고,
 * 중성(모음)별 입 열림값을 시간축에 배치한다.
 */

// 중성(jungseong) 인덱스 0~20 순서: ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ
const _VOWEL_OPEN = [
  0.90, // 0: ㅏ
  0.75, // 1: ㅐ
  0.90, // 2: ㅑ
  0.75, // 3: ㅒ
  0.80, // 4: ㅓ
  0.65, // 5: ㅔ
  0.80, // 6: ㅕ
  0.65, // 7: ㅖ
  0.55, // 8: ㅗ
  0.70, // 9: ㅘ
  0.70, // 10: ㅙ
  0.45, // 11: ㅚ
  0.55, // 12: ㅛ
  0.50, // 13: ㅜ
  0.58, // 14: ㅝ
  0.58, // 15: ㅞ
  0.45, // 16: ㅟ
  0.50, // 17: ㅠ
  0.30, // 18: ㅡ
  0.30, // 19: ㅢ
  0.38, // 20: ㅣ
];

function _decomposeKorean(char) {
  const code = char.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 0x2BA3) return null; // AC00~D7A3 범위 밖
  return {
    nucleus: Math.floor((code / 28) % 21),
    hasCoda: (code % 28) !== 0,
  };
}

/**
 * 텍스트와 오디오 재생시간(ms)을 받아 viseme 프레임 배열을 반환한다.
 * 각 프레임: { timeMs: number, openValue: number (0~1) }
 * 프레임은 timeMs 오름차순으로 정렬되어 있다.
 *
 * 빈 배열을 반환하면 amplitude fallback으로 처리해야 한다.
 */
export function buildVisemeSchedule(text, durationMs) {
  const syllables = [];

  for (const ch of text) {
    const d = _decomposeKorean(ch);
    if (d) {
      syllables.push({ peak: _VOWEL_OPEN[d.nucleus] ?? 0.5, hasCoda: d.hasCoda });
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      syllables.push({ peak: 0.40, hasCoda: false });
    }
    // 공백/구두점은 음절 수에 포함하지 않음
  }

  if (!syllables.length) return [];

  const msPerSyl = durationMs / syllables.length;
  const frames = [];

  for (let i = 0; i < syllables.length; i++) {
    const t = i * msPerSyl;
    const { peak, hasCoda } = syllables[i];

    frames.push({ timeMs: t,                    openValue: 0.05 });
    frames.push({ timeMs: t + msPerSyl * 0.20,  openValue: peak });
    frames.push({ timeMs: t + msPerSyl * 0.75,  openValue: hasCoda ? 0.05 : 0.10 });
    frames.push({ timeMs: t + msPerSyl * 0.90,  openValue: 0 });
  }

  frames.push({ timeMs: durationMs, openValue: 0 });

  return frames;
}
