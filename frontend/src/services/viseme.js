/**
 * 한국어 텍스트 → viseme 프레임 배열 변환.
 * 유니코드 산술로 음절을 분해하고, 중성(모음)별 입 열림값을 시간축에 배치한다.
 *
 * 타이밍 전략 — 가중 단위 분배(weighted-unit):
 *   전체 시간 T를 "단위" 개념으로 쪼갠다.
 *   음절 = 1 단위, 띄어쓰기 = K_SPACE 단위, 구두점 = K_HARD / K_SOFT 단위.
 *   ms_per_unit = T / total_units
 *   → 단어 경계·문장 끝에서 자연스러운 입 닫힘이 생긴다.
 *
 * 향후 TTS가 음절별 타임스탬프를 제공하게 되면:
 *   buildVisemeScheduleFromOnsets(text, onsetTimesMs)   — 오디오 onset 감지 기반
 *   buildVisemeScheduleFromWhisper(text, whisperWords)  — Whisper word-level 정렬 기반
 * lipsync.js는 [{timeMs, openValue}] 배열만 받으므로 이 파일만 수정하면 된다.
 */

// ---------------------------------------------------------------------------
// 가중치 상수 (단위: 음절 1개 = 1.0 기준)
// ---------------------------------------------------------------------------
const _K_SPACE = 0.5;  // 띄어쓰기 → 음절 50% 시간의 입 닫힘
const _K_HARD  = 1.5;  // 강한 구두점(. ? !) → 음절 150% 시간의 정지
const _K_SOFT  = 0.7;  // 약한 구두점(,) → 음절 70% 시간의 정지

// 토큰 타입 상수
const _T_SYL   = 0;
const _T_SPACE = 1;
const _T_HARD  = 2;
const _T_SOFT  = 3;

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
 * 텍스트를 토큰 배열로 변환한다.
 *
 * 규칙:
 * - 공백 여러 개 연속 → SPACE 토큰 1개 (중복 제거)
 * - 구두점 뒤 공백 → 공백 흡수 (SPACE 토큰 추가 안 함)
 * - 연속 같은 구두점 → 첫 번째만 토큰으로 생성
 * - 선행 공백 → 무시 (토큰 없을 때 SPACE 생성 안 함)
 */
function _tokenize(text) {
  const tokens = [];
  let skipNextSpace = false;

  for (const ch of text.trimEnd()) {
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (!skipNextSpace && tokens.length > 0 && tokens[tokens.length - 1].type === _T_SYL) {
        tokens.push({ type: _T_SPACE });
      }
      skipNextSpace = false;

    } else if (/[.?!…]/.test(ch)) {
      const last = tokens[tokens.length - 1];
      if (last && last.type === _T_SPACE) {
        // 앞 공백을 강한 구두점으로 교체 (더 강한 정지)
        tokens[tokens.length - 1] = { type: _T_HARD };
      } else if (!last || last.type !== _T_HARD) {
        tokens.push({ type: _T_HARD });
      }
      skipNextSpace = true; // 구두점 뒤 공백 흡수

    } else if (ch === ',') {
      const last = tokens[tokens.length - 1];
      if (last && last.type === _T_SPACE) {
        tokens[tokens.length - 1] = { type: _T_SOFT };
      } else if (last && last.type === _T_SYL) {
        tokens.push({ type: _T_SOFT });
      }
      skipNextSpace = true;

    } else {
      const d = _decomposeKorean(ch);
      if (d) {
        tokens.push({ type: _T_SYL, peak: _VOWEL_OPEN[d.nucleus] ?? 0.5, hasCoda: d.hasCoda });
        skipNextSpace = false;
      } else if (/[a-zA-Z0-9]/.test(ch)) {
        tokens.push({ type: _T_SYL, peak: 0.40, hasCoda: false });
        skipNextSpace = false;
      }
      // 기타 문자 (괄호, 특수기호 등) → 무시
    }
  }

  return tokens;
}

/**
 * 텍스트와 오디오 재생시간(ms)을 받아 viseme 프레임 배열을 반환한다.
 * 각 프레임: { timeMs: number, openValue: number (0~1) }
 * 프레임은 timeMs 오름차순으로 정렬되어 있다.
 *
 * 빈 배열 반환 → 발음 가능한 음절이 없음 → 호출 측에서 _dummy() 처리.
 */
export function buildVisemeSchedule(text, durationMs) {
  const tokens = _tokenize(text);
  if (!tokens.some(t => t.type === _T_SYL)) return [];

  // 총 단위 수 계산
  let totalUnits = 0;
  for (const tok of tokens) {
    if      (tok.type === _T_SYL)   totalUnits += 1;
    else if (tok.type === _T_SPACE) totalUnits += _K_SPACE;
    else if (tok.type === _T_HARD)  totalUnits += _K_HARD;
    else if (tok.type === _T_SOFT)  totalUnits += _K_SOFT;
  }

  const msPerUnit = durationMs / totalUnits;
  const msSyl   = msPerUnit;
  const msSpace = _K_SPACE * msPerUnit;
  const msHard  = _K_HARD  * msPerUnit;
  const msSoft  = _K_SOFT  * msPerUnit;

  const frames = [];
  let t = 0;

  for (const tok of tokens) {
    if (tok.type === _T_SYL) {
      const { peak, hasCoda } = tok;
      frames.push({ timeMs: t,                  openValue: 0.05 });
      frames.push({ timeMs: t + msSyl * 0.20,   openValue: peak });
      frames.push({ timeMs: t + msSyl * 0.75,   openValue: hasCoda ? 0.05 : 0.10 });
      frames.push({ timeMs: t + msSyl * 0.90,   openValue: 0 });
      t += msSyl;
    } else if (tok.type === _T_SPACE) {
      frames.push({ timeMs: t, openValue: 0 });
      t += msSpace;
    } else if (tok.type === _T_HARD) {
      frames.push({ timeMs: t, openValue: 0 });
      t += msHard;
    } else if (tok.type === _T_SOFT) {
      frames.push({ timeMs: t, openValue: 0 });
      t += msSoft;
    }
  }

  frames.push({ timeMs: durationMs, openValue: 0 });
  return frames;
}

// 테스트 전용 export
export { _tokenize, _T_SYL, _T_SPACE, _T_HARD, _T_SOFT };
