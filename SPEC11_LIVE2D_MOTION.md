# SPEC-11 — Live2D 모션 시스템 설계 문서

> 작성: 2026-05-14  
> 상태: 설계 완료, 구현 대기  
> 관련: STATUS.md SPEC-11, `frontend/src/services/characterController.js`

---

## 1. 모델 환경 분석

### 사용 모델
| 모델 | 물리 파일 | motion3.json | 표정 파일 | 파라미터 수 |
|------|-----------|--------------|-----------|-------------|
| Hachiware | ✅ 있음 | ❌ 없음 | 4개 | 34개 |
| Hamster | ❌ 없음 | ❌ 없음 | 없음 | — |

### 결론
**motion3.json 파일이 없다 → 모든 모션은 파라미터 직접 조작(programmatic tween)으로 구현한다.**  
물리 파일이 있는 모델(Hachiware)은 머리카락·귀가 파라미터 움직임에 자동으로 반응함 → 별도 처리 없이 자연스럽게 흔들림.

### Hachiware 전체 파라미터 목록 (활용 가능한 것)
```
머리 회전   : ParamAngleX (좌우 -30~30), ParamAngleY (상하 -20~20), ParamAngleZ (기울기 -30~30)
몸통 회전   : ParamBodyAngleX (-10~10), ParamBodyAngleY (-10~10), ParamBodyAngleZ (-10~10)
호흡        : ParamBreath (0~1) — 물리 연동
눈 개폐     : ParamEyeLOpen (0~1), ParamEyeROpen (0~1)
눈 웃음     : ParamEyeLSmile (0~1), ParamEyeRSmile (0~1)
시선        : ParamEyeBallX (-1~1), ParamEyeBallY (-1~1)
눈썹 높이   : ParamBrowLY (-1~1), ParamBrowRY (-1~1)
눈썹 X      : ParamBrowLX (-1~1), ParamBrowRX (-1~1)
눈썹 각도   : ParamBrowLAngle (-1~1), ParamBrowRAngle (-1~1)
눈썹 형태   : ParamBrowLForm (-1~1), ParamBrowRForm (-1~1)
입 형태     : ParamMouthForm (-1=찡그림, 1=미소), ParamMouthOpenY (0~1)
볼          : ParamCheek (0~1)
머리카락    : ParamHairFront, ParamHairSide, ParamHairBack — 물리 자동 제어
귀 물리     : Param3 (ear physics) — 물리 자동 제어
특수 토글   : Param7 (glitter eyes 0~1), Param5 (nervous toggle 0~1),
              Param6 (tear toggle 0~1), Param4 (spear toggle 0~1)
```

---

## 2. 전체 파이프라인 설계

### 2-1. 개요

```
LLM 응답 스트림 (SSE)
   ↓
token 이벤트 누적
   ↓ [action:keyword] 태그 인라인 포함 가능
done 이벤트
   ↓
┌─────────────────────────────────────────────┐
│  응답 파싱                                   │
│  "음 모르겠는데? [action:갸웃하기]             │
│   그래도 될거 같아 [action:끄덕이기]"         │
└──────────────┬──────────────────────────────┘
               ↓
     세그먼트 분리 (splitByActions)
     [
       { text: "음 모르겠는데?",    action: "갸웃하기" },
       { text: "그래도 될거 같아",  action: "끄덕이기" },
     ]
               ↓
  ┌────────────────────┬────────────────────────┐
  │ 채팅 표시          │ 음성+모션 파이프라인     │
  │ 태그 제거된        │ 세그먼트 순서대로:       │
  │ 클린 텍스트 렌더링 │ 1. TTS speak(text)       │
  └────────────────────┤ 2. 오디오 재생 완료      │
                       │ 3. playAction(keyword)   │
                       │ 4. 모션 완료              │
                       │ 5. 다음 세그먼트 →        │
                       └────────────────────────┘
```

> 음성 모드가 OFF인 경우: 세그먼트 파싱 없이 모든 action을 순서대로 즉시 실행.  
> 음성 모드가 ON인 경우: TTS 세그먼트 재생이 끝날 때마다 해당 action 발화.

### 2-2. 태그 포맷

```
[action:키워드]
```

- 따옴표 없음. 정규식: `/\[action:([^\]]+)\]/g`
- 응답 중간 어디든 삽입 가능
- 한 응답에 여러 개 가능 (순서 보장)
- 채팅 표시와 TTS 음성에서는 완전히 제거됨

### 2-3. 시스템 프롬프트 동적 주입

백엔드 `model_context_service.py`의 `_AVAILABLE_ACTIONS` 상수에서 키워드 목록을 읽어
`context_builder.py`가 매 `/chat` 요청마다 시스템 프롬프트에 자동 주입.

주입 형태:
```
## 사용 가능한 액션
다음 키워드로 행동을 표현할 수 있어. 대답 중 자연스러운 지점에 삽입해:
  끄덕이기   — 동의, 이해, 확인할 때
  갸웃하기   — 의문, 궁금증, 모를 때
  고개젓기   — 부정, 모르겠음, 놀라움
  ...
행동이 어울리지 않으면 쓰지 마. 반드시 [action:키워드] 형식으로.
```

→ 모션 추가/삭제 시 `_AVAILABLE_ACTIONS`만 업데이트하면 시스템 프롬프트 자동 반영.  
→ 하드코딩 없음. AI가 새 키워드를 바로 인식.

### 2-4. 모션 맺고 끊음 처리

각 모션 실행 후 `returnToDefault(600ms)` 자동 호출 → 기본 자세 복귀.  
여러 액션이 연속으로 큐에 있으면 앞 액션 완료 + 복귀 후 다음 액션 실행.

```
playInlineActions(["갸웃하기", "끄덕이기"])
  → playMotionSequence("갸웃하기")  // ~400ms
  → returnToDefault(600ms)
  → playMotionSequence("끄덕이기")  // ~500ms
  → returnToDefault(600ms)
  → 완료
```

### 2-5. 우선순위 & 충돌 방지

| 상황 | 처리 |
|------|------|
| 인라인 액션 실행 중 → emotion_update 도착 | emotion_update 스킵 (이미 구현됨 `_inlineActionsActive`) |
| 인라인 액션 실행 중 → 새 메시지 전송 | TTS 중단 → 현재 모션 완료 후 큐 비움 |
| 두 모션 동시 발화 불가 | `_motionActive` 플래그로 직렬화 |
| idle breathing vs 모션 | `_motionActive` 시 breathing 파라미터 간섭 없음 (이미 구현됨) |

---

## 3. 모션 라이브러리 — 키워드 & 파라미터 정의

### 설계 원칙
- 각 모션은 복수의 파라미터를 **병렬**로 동시에 트윈
- `return_to_default: true` → 원위치 자동 복귀
- 총 지속시간: 300~900ms (대화 흐름을 끊지 않는 범위)
- 키워드는 한국어 동사형 (끄덕이기, 갸웃하기 등) — AI가 직관적으로 선택 가능

---

### [끄덕이기]
**언제**: 동의, 이해 확인, "맞아", "그래", "알겠어"

```javascript
끄덕이기: [
  // 고개를 앞으로 내리다가 다시 올라옴 (Y+ = 아래)
  { abstract: "head_y",  value: 12,  duration: 200, easing: "ease_out",  return_to_default: true, repeat: 2 },
  { abstract: "smile",   value: 0.4, duration: 300, easing: "ease_in_out", return_to_default: true },
]
```

---

### [갸웃하기]
**언제**: 의문, 모를 때, "어?", "그게 뭐야?", 흥미로운 정보 접했을 때

```javascript
갸웃하기: [
  // 고개를 한쪽으로 기울임 + 한쪽 눈썹 살짝 올라감
  { abstract: "head_z",  value: -18, duration: 350, easing: "ease_in_out", return_to_default: true },
  { abstract: "head_y",  value: -3,  duration: 350, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_l",  value: 0.3, duration: 350, easing: "ease_in_out", return_to_default: true },
  { abstract: "gaze_y",  value: 0.15,duration: 350, easing: "ease_in_out", return_to_default: true },
]
```

---

### [고개젓기]
**언제**: 부정, "아니야", "그건 아닌 것 같아", 놀라운 부정

```javascript
고개젓기: [
  // X축으로 좌우 진동 (repeat 3)
  { abstract: "head_x",  value: 15, duration: 180, easing: "ease_in_out", return_to_default: true, repeat: 3 },
  { abstract: "brow_l",  value: -0.2, duration: 200, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_r",  value: -0.2, duration: 200, easing: "ease_in_out", return_to_default: true },
]
```

---

### [활짝웃기]
**언제**: 기쁨, 성공, 좋은 소식, "됐다!", 칭찬받을 때

```javascript
활짝웃기: [
  { abstract: "smile",      value: 1.0, duration: 400, easing: "ease_out",    return_to_default: true },
  { abstract: "eye_smile",  value: 1.0, duration: 400, easing: "ease_out",    return_to_default: true },
  { abstract: "eye_open",   value: 0.8, duration: 400, easing: "ease_out",    return_to_default: true },
  { abstract: "head_y",     value: -5,  duration: 300, easing: "ease_out",    return_to_default: true },
  { abstract: "cheek",      value: 0.6, duration: 500, easing: "ease_in_out", return_to_default: true },
]
```

---

### [놀라기]
**언제**: 예상치 못한 정보, "헐", "진짜?!", 충격

```javascript
놀라기: [
  { abstract: "head_y",  value: -10, duration: 150, easing: "ease_out",    return_to_default: true },
  { abstract: "eye_open",value: 1.0, duration: 150, easing: "ease_out",    return_to_default: true },
  { abstract: "brow_l",  value: 0.8, duration: 150, easing: "ease_out",    return_to_default: true },
  { abstract: "brow_r",  value: 0.8, duration: 150, easing: "ease_out",    return_to_default: true },
  { abstract: "mouth_open", value: 0.3, duration: 200, easing: "ease_out", return_to_default: true },
]
```

---

### [걱정하기]
**언제**: 부정적 상황, 안타까움, "그거 좀 걱정되는데", 위험 감지

```javascript
걱정하기: [
  { abstract: "head_y",  value: 6,    duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_l",  value: -0.6, duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_r",  value: -0.6, duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_l_angle", value: 0.5, duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_r_angle", value: -0.5, duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "smile",   value: -0.3, duration: 500, easing: "ease_in_out", return_to_default: true },
]
```

---

### [생각하기]
**언제**: 고민 중, 답을 찾는 중, "음...", 잠시 멈춤

```javascript
생각하기: [
  // 시선이 위로 가고 고개 살짝 기울임
  { abstract: "head_z",  value: -10, duration: 600, easing: "ease_in_out", return_to_default: true },
  { abstract: "gaze_y",  value: -0.4, duration: 600, easing: "ease_in_out", return_to_default: true },
  { abstract: "gaze_x",  value: 0.3, duration: 600, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_l",  value: 0.2, duration: 600, easing: "ease_in_out", return_to_default: true },
  { abstract: "eye_open",value: 0.85,duration: 600, easing: "ease_in_out", return_to_default: true },
]
```

---

### [하품하기]
**언제**: 졸릴 때, 새벽 대화, SLEEPY 무드, "이제 자야 되지 않아?"

```javascript
하품하기: [
  { abstract: "mouth_open", value: 1.0, duration: 700, easing: "ease_in_out", return_to_default: true },
  { abstract: "eye_open",   value: 0.2, duration: 700, easing: "ease_in_out", return_to_default: true, delay: 200 },
  { abstract: "head_y",     value: 8,   duration: 700, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_l",     value: -0.3, duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_r",     value: -0.3, duration: 500, easing: "ease_in_out", return_to_default: true },
]
```

---

### [수줍어하기]
**언제**: 칭찬받을 때, 좋아하는 것 언급, 부끄러운 상황

```javascript
수줍어하기: [
  { abstract: "head_y",  value: 8,   duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "head_z",  value: 12,  duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "cheek",   value: 1.0, duration: 600, easing: "ease_in_out", return_to_default: true },
  { abstract: "smile",   value: 0.6, duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "eye_open",value: 0.7, duration: 500, easing: "ease_in_out", return_to_default: true },
]
```

---

### [반짝이는눈]
**언제**: 흥미로운 것 발견, 엄청 마음에 드는 것, HAPPY/EXCITED, "이거 완전 좋은데?!"

```javascript
반짝이는눈: [
  // Hachiware 전용 특수 파라미터 (glitter eyes)
  { abstract: "glitter_eyes", value: 1.0, duration: 300, easing: "ease_out", return_to_default: true },
  { abstract: "smile",        value: 0.8, duration: 400, easing: "ease_out", return_to_default: true },
  { abstract: "head_y",       value: -4,  duration: 300, easing: "ease_out", return_to_default: true },
]
```

---

### [울먹이기]
**언제**: 감동적인 얘기, 슬픈 상황 공감, "그거 진짜 마음이 아프다"

```javascript
울먹이기: [
  // Hachiware 전용 특수 파라미터 (tear toggle)
  { abstract: "tear",    value: 1.0, duration: 400, easing: "ease_in",     return_to_default: true },
  { abstract: "brow_l",  value: -0.5, duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_l_angle", value: 0.6, duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_r_angle", value: -0.6, duration: 500, easing: "ease_in_out", return_to_default: true },
  { abstract: "smile",   value: -0.2, duration: 500, easing: "ease_in_out", return_to_default: true },
]
```

---

### [긴장하기]
**언제**: 어려운 작업, 불확실한 결과 기다리기, "이거 될지 모르겠는데..."

```javascript
긴장하기: [
  // Hachiware 전용 특수 파라미터 (nervous toggle)
  { abstract: "nervous",  value: 1.0, duration: 300, easing: "ease_out",    return_to_default: true },
  { abstract: "brow_l",   value: -0.3, duration: 400, easing: "ease_in_out", return_to_default: true },
  { abstract: "brow_r",   value: -0.3, duration: 400, easing: "ease_in_out", return_to_default: true },
  { abstract: "eye_open", value: 0.9, duration: 300, easing: "ease_out",    return_to_default: true },
]
```

---

## 4. 추상 파라미터 매핑 추가 항목

현재 `_defaultMapping()`에 없는 파라미터 — 이번 구현에서 추가 필요:

| 추상 이름 | Live2D 파라미터 | 설명 |
|-----------|----------------|------|
| `eye_smile` | `ParamEyeLSmile` | 눈 웃음 (좌우 동시) |
| `eye_r_open` | `ParamEyeROpen` | 오른눈 개폐 (독립 제어 시) |
| `brow_l_angle` | `ParamBrowLAngle` | 왼쪽 눈썹 각도 |
| `brow_r_angle` | `ParamBrowRAngle` | 오른쪽 눈썹 각도 |
| `cheek` | `ParamCheek` | 볼 (블러시) |
| `body_y_angle` | `ParamBodyAngleY` | 몸통 상하 기울기 |
| `body_z` | `ParamBodyAngleZ` | 몸통 Z축 회전 |
| `breath` | `ParamBreath` | 호흡 (0~1) |
| `glitter_eyes` | `Param7` | 반짝이는 눈 (Hachiware 전용) |
| `nervous` | `Param5` | 긴장 표정 (Hachiware 전용) |
| `tear` | `Param6` | 눈물 (Hachiware 전용) |

**모델별 폴백**: `Param7`, `Param5`, `Param6`은 Hachiware에만 존재.  
다른 모델에서는 `setAbstractParam`이 `actual = undefined` → `_apply` 조용히 스킵됨. 별도 처리 불필요.

---

## 5. TTS 연계 — 세그먼트 분리 파이프라인

### 분리 로직

```javascript
function splitByActions(text) {
  // "[action:갸웃하기]" 기준으로 분리
  const TAG_RE = /\[action:([^\]]+)\]/g;
  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = TAG_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim();
    segments.push({ text: before, action: match[1] });
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining) segments.push({ text: remaining, action: null });

  return segments;
}
```

### 음성 모드 ON 시 실행 흐름

```javascript
// useChat.js done 이벤트 처리
if (isVoiceMode) {
  const segments = splitByActions(cleanContent);
  for (const seg of segments) {
    if (seg.text) await ttsService.speak(seg.text);       // 발화
    if (seg.action) await characterController.playInlineActions([seg.action]);  // 모션
  }
} else {
  // 음성 모드 OFF: 전체 모션 즉시 실행
  if (actions.length) characterController.playInlineActions(actions);
}
```

### 음성 모드 OFF 시
TTS 재생 없음 → 액션들 전체를 순서대로 즉시 실행 (현재 구현 그대로).

---

## 6. idle 상태 개선 (Live2D 기본 루프)

### 현재 문제
`startIdleBreathing()`이 Live2D 모델에 대해 즉시 return → idle 루프 없음.

### 해결 방향
Live2D 모델에도 호흡 루프 구현. `ParamBreath`(0→1→0 사인파)와 미세한 head sway 추가.

```javascript
startIdleBreathing() {
  // ...
  let time = 0;
  const tick = () => {
    if (!this._motionActive) {
      if (this.renderer?.type === "live2d") {
        // Live2D: 호흡 + 미세 머리 흔들림
        this.setAbstractParam("breath", 0.5 + Math.sin(time * 0.6) * 0.5);
        this.setAbstractParam("head_z", Math.sin(time * 0.25) * 2);
        this.setAbstractParam("head_y", Math.sin(time * 0.18) * 1.5);
      } else {
        this.setAbstractParam("body_y", Math.sin(time * 0.8) * 0.03);
      }
    }
    time += 0.016;
    this._breathFrame = requestAnimationFrame(tick);
  };
  this._breathFrame = requestAnimationFrame(tick);
}
```

---

## 7. 구현 체크리스트

### Phase A — 파운데이션 ✅ 완료
- [x] `_defaultMapping()`에 신규 추상 파라미터 추가 (cheek, eye_smile, brow_l_angle 등)
- [x] `MOTION_PRESETS` 교체: 기존 영어 키 → 한국어 키워드 12개
- [x] `characterController.js`: `startIdleBreathing()` Live2D 분기 추가
- [x] 태그 정규식: `/\[action:([^\]]+)\]/g` (한국어 지원)

### Phase B — TTS 연계
- [ ] `useChat.js`: `splitByActions()` 헬퍼 추가
- [ ] `useChat.js`: 음성 모드 ON 시 세그먼트 순서 재생 로직
- [ ] `tts.js`: `speak()` Promise 반환 확인 (이미 됨)

### Phase C — 백엔드 동기화
- [x] `model_context_service.py` `_AVAILABLE_ACTIONS`: 한국어 키워드 + 설명 dict
- [x] 시스템 프롬프트 주입 포맷: `[action:키워드]` 따옴표 없는 형식
- [x] `llm.py` `postprocess_for_voice()`: `/\[action:[^\]]+\]/g` 패턴으로 제거

### Phase D — 검증
- [ ] Hachiware 모델로 각 12개 모션 시각 확인
- [ ] 단일 응답 내 다중 액션 시퀀스 동작 확인
- [ ] 음성 모드 ON: TTS 세그먼트와 모션 타이밍 확인
- [ ] 테스트 업데이트 (태그 포맷 변경에 따른 기존 테스트 수정)

---

## 8. 시스템 프롬프트 주입 예시 (최종 형태)

```
## 행동 표현
대답 중 자연스러운 지점에 아래 키워드로 행동을 표현할 수 있어.
형식: [action:키워드] — 따옴표 없음.
행동이 어울리지 않으면 쓰지 마. 억지로 넣지 않아도 돼.

  끄덕이기   — 동의, 이해, 확인할 때
  갸웃하기   — 의문, 모를 때, 흥미로울 때
  고개젓기   — 부정, 모르겠음
  활짝웃기   — 기쁨, 성공, 좋은 소식
  놀라기     — 예상치 못한 정보, 충격
  걱정하기   — 안타까움, 우려, 부정적 상황
  생각하기   — 고민 중, 답을 찾는 중
  하품하기   — 졸릴 때, 새벽 대화
  수줍어하기 — 칭찬받을 때, 부끄러운 상황
  반짝이는눈 — 흥미로운 것 발견, 엄청 마음에 들 때
  울먹이기   — 감동적인 얘기, 슬픈 상황 공감
  긴장하기   — 어려운 작업, 불확실한 결과 기다릴 때

예시: "음.. 그건 잘 모르겠는데? [action:갸웃하기] 그래도 괜찮을 것 같아 [action:끄덕이기]"
```
