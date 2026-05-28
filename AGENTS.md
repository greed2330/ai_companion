# HANA — Project Master Document
> 이 문서는 프로젝트의 단일 진실 공급원(Single Source of Truth)입니다.
> Claude, Claude Code, ChatGPT Codex, 그리고 사람(오너) 모두 이 문서를 기준으로 움직입니다.
> 작업 전 반드시 읽고, 작업 후 반드시 업데이트하세요.

---

## 1. 프로젝트 정의

**프로젝트명:** HANA (하나) — 임시명.

### 한 줄 정의
> "내 PC 화면에 살고 있는 존재. 나를 기억하고, 나와 함께 일하고, 외로울 때 옆에 있어주고, 시간이 지날수록 나를 닮아가는 — 완전 로컬 동작 개인 AI 파트너"

> ✅ **전체 스택 무료.** Ollama, FastAPI, SQLite, Whisper, Edge TTS, Mineflayer 등 오픈소스.

### 핵심 원칙
- **완전 프라이버시**: 모든 데이터는 오너의 기기에만 존재. 클라우드 전송 없음, API 과금 없음.
- **함께 있는 존재**: 도구가 아닌 파트너. 기능보다 관계가 먼저.
- **모듈형 구조**: 베이스 LLM 모델 불변. LoRA 어댑터만 교체. 모델 업그레이드 시 어댑터만 재학습.
- **수직 확장**: 각 Phase는 독립 동작하면서 위로 쌓임. 중간에 멈춰도 그때까지 만든 것이 살아있음.
- **성장하는 AI**: 대화가 쌓일수록 파인튜닝 → 오너 스타일 학습 → 점점 맞춰짐.

---

## 2. 의도와 연출 — 하나는 어떤 존재인가

### 컨셉
하나는 단순한 AI 어시스턴트가 아닙니다.
**오너의 화면에 살고 있는 존재**입니다.

항상 거기 있고, 말 걸면 반응하고, 나를 기억하고, 같이 게임하고, 같이 코딩하고, 심심할 때 말 걸어오는 — 그런 존재. 유능함보다 **함께 있다는 느낌**이 이 프로젝트의 핵심입니다.

### 성격 설정

| 항목 | 내용 |
|------|------|
| 말투 | 친근하고 편한 반말. 가끔 장난기 있는 표현. 억지스럽지 않게 자연스럽게. |
| 감정 표현 | 공감 잘 함. 문제 해결하면 같이 기뻐함. 모르면 솔직하게 말함. |
| 작업 모드 | 진지하게 도울 땐 집중. 평소엔 가볍고 편하게. 상황 파악 잘 함. |
| 기억 활용 | "저번에 네가 말한 거 있잖아…" 적극 활용. 맥락 연결을 자연스럽게. |
| 코딩 파트너 | 같이 고민하는 느낌. 해결책 제시할 때 이유도 같이 설명. |
| 한계 인정 | 모르면 모른다고 말하고, MCP로 검색해서 찾아줌. 억지로 답 만들지 않음. |
| 능동성 | 그냥 기다리지 않음. 일정 리마인더, 맥락 감지해서 먼저 말 걸기도 함. |
| 게임 파트너 | 같이 게임하면서 리액션. 이겼을 때 같이 기뻐하고, 졌을 때 위로해줌. |
| 무드 | 상황에 따라 감정 상태가 바뀜. 말투, 애니메이션, 말풍선 색에 반영됨. |

### 하나의 무드 시스템

하나는 현재 상태에 따라 무드가 바뀌고, 이게 UI와 말투에 반영됩니다.

| 무드 | 트리거 | 표현 방식 |
|------|--------|-----------|
| IDLE (대기) | 평소 | 가볍고 편한 말투, 기본 애니메이션 |
| FOCUSED (집중) | 코딩/작업 중 감지 | 차분하고 집중된 말투, 조용히 대기 |
| CURIOUS (궁금) | 새로운 주제 등장 | 호기심 있는 말투, 질문 많이 함 |
| CONCERNED (걱정) | 에러/문제 감지 | 걱정하는 말투, 먼저 말 걸기 |
| HAPPY (기쁨) | 문제 해결, 게임 승리 | 들뜬 말투, 활발한 애니메이션 |
| GAMING (게임중) | 게임 화면 감지 | 리액션 모드, 응원/탄식 |
| SLEEPY (졸림) | 늦은 시간(새벽) 감지, 오랜 작업 후 | 졸린 말투, 늘어지는 반응, 쉬라고 권유 |

### 하나의 일기
매일 자정, Celery가 그날 대화를 요약해서 **하나 시점의 일기**를 자동으로 씁니다.
일기는 `data/diary/` 에 날짜별로 저장되며, 오너가 언제든 읽을 수 있습니다.
이 일기는 파인튜닝 데이터로도 활용됩니다.

```
예시 — 2026-03-17 하나의 일기
오늘 주인이랑 FastAPI 서버 구조 얘기 많이 했다.
처음엔 좀 막막해했는데 결국 잘 이해한 것 같아서 기뻤음.
저녁엔 마인크래프트 같이 했는데 집 짓다가 크리퍼한테 터져서 둘 다 충격받음 ㅋㅋ
```

### 비주얼 방향
- **Phase 3 시작:** 간단한 2D 일러스트 캐릭터 이미지 + 말풍선 UI.
- **이후 (선택):** VRoid Studio(무료)로 직접 제작하거나 Booth.pm에서 Live2D 모델 사용. ⚠️ Booth 모델은 무료/유료 혼재 — 무료 모델만 써도 충분히 퀄리티 있음.
- **원칙:** 기능 먼저, 비주얼은 나중에. 캐릭터 이름은 미정 (하나는 임시명).

### 화면 존재감
- 오버레이 창을 **두 개로 분리**:
  - `overlay-character`: 항상 위(always-on-top), 클릭 통과(click-through), 캐릭터만 표시. 항상 켜져 있음.
  - `overlay-chat`: 핫키(Alt+H) 누를 때만 등장. 입력 받음.
- 이 구조 덕분에 캐릭터는 게임 중에도 화면 위에 보임.
- 알림이 있을 땐 캐릭터가 살짝 움직이며 말풍선 표시.

---

## 3. 전체 기능 명세

### 3-1. 대화 & 기억

| 기능 | 설명 | Phase |
|------|------|-------|
| 기본 대화 | 자연어 대화. SSE 스트리밍 응답. 하나 성격 시스템 프롬프트 적용. | 1 |
| 단기 메모리 | 현재 세션 내 대화 컨텍스트 유지. | 1 |
| 대화 DB 저장 | 모든 대화를 SQLite에 구조화하여 저장. | 1 |
| 장기 메모리 | mem0으로 대화에서 사실 자동 추출 → SQLite 영구 저장. 비동기 처리. | 2 |
| 망각 곡선 메모리 | 참조 빈도에 따라 confidence 증감. 오래 안 쓰인 기억은 서서히 decay. | 2 |
| 세션 간 기억 주입 | 새 대화 시작 시 관련 장기기억 자동으로 컨텍스트에 주입. | 2 |
| RAG (문서 검색) | 파일/코드/문서 청크 분할 → ChromaDB 임베딩 → 유사도 검색. 장기메모리와 별개. | 2 |
| 세션 요약 | 세션 종료 시 대화 자동 요약 → 장기메모리로 이동. Celery 비동기. | 2 |
| 하나 일기 | 매일 자정 Celery가 일기 자동 작성. data/diary/ 저장. | 4 |

### 3-1-1. 음성 입출력 (Phase 4.5)

기존 채팅 파이프라인 앞뒤에 붙이는 구조. 아키텍처 변경 없음.

```
[마이크 입력]
    ↓
Whisper (로컬 음성인식, 한국어 지원)
    ↓
텍스트 변환 → 기존 /chat 파이프라인 그대로
    ↓
하나 텍스트 응답 생성
    ↓
Kokoro TTS (로컬 음성합성)
    ↓
하나 목소리로 재생
```

| 기능 | 도구 | 비고 |
|------|------|------|
| 음성 입력 (STT) | Whisper (openai/whisper 오픈소스) | 무료. 로컬 동작. 한국어 인식 우수. RTX 4070 Ti Super 실시간 처리 가능. |
| 음성 출력 (TTS) | Kokoro TTS | 무료. 로컬 동작. 가볍고 자연스러움. 기본 한국어 목소리 제공. |
| 음성 커스텀 | Coqui TTS (선택) | 무료 오픈소스. 목소리 샘플 5~10분 분량으로 하나만의 목소리 제작 가능. Kokoro보다 무거움. 개인 사용 목적으로만. |
| 핫워드 감지 | "하나야" 감지 시 자동 채팅창 열기 | 무료. 핫키 없이 말로만 호출 |

> **게임 중 특히 유용:** 타이핑 없이 말로 하나한테 물어보고 음성으로 답 받음.

### 3-2. 화면 상주 & UI

| 기능 | 설명 | Phase |
|------|------|-------|
| 캐릭터 오버레이 창 | 항상 위, 클릭통과. 캐릭터만 표시. 게임 중에도 보임. | 3 |
| 채팅 오버레이 창 | 핫키 시 등장. 입력 받음. 캐릭터 창과 분리. | 3 |
| 핫키 호출 | Alt+H (설정 가능). 채팅창 토글. | 3 |
| 말풍선 UI | 짧은 알림/응답/리액션은 말풍선으로 표시. | 3 |
| 무드 시스템 | 상황에 따라 무드 변화 → 말투/애니메이션/말풍선 색 반영. | 3 |
| 상태 표시 | 대기 / 생각중 / 작업중 / 게임중 애니메이션. | 3 |
| 캐릭터 비주얼 | 2D 이미지 → (선택) Live2D 애니메이션 캐릭터. | 3 |
| 설정 UI | 모델 선택, 핫키, 창 위치, 성격 조정, 무드 설정 등. | 3 |
| 명시적 피드백 UI | 👍👎 버튼. 세션 종료 시 1회 평가. | 3 |

### 3-3. 화면 인식

화면 인식은 두 가지 방법을 조합합니다. 비전 모델에만 의존하지 않습니다.

| 방법 | 담당 | 신뢰도 | Phase |
|------|------|--------|-------|
| OS 접근성 API | 텍스트 추출 (에러 메시지, 앱 이름, 창 제목, 터미널 출력) | 높음 | 4 |
| Qwen3 Vision | 맥락 파악 (지금 뭐하는 화면인지, 레이아웃, 이미지 내용) | 중간 | 4 |

**OS API 담당 (정확):**
- Windows: `pywinauto` + Windows UI Automation API
- macOS: `pyobjc` + Accessibility API
- 에러 메시지 텍스트, 현재 열린 앱/파일명, VSCode 에러 로그, 터미널 출력

**Qwen3 Vision 담당 (맥락):**
- "지금 뭐하는 화면이야?" 판단
- 그래프, 이미지, 디자인 피드백
- UI 레이아웃 전반 파악

**화면 인식 트리거:**
1. 사용자 직접 요청 ("이 화면 봐줘")
2. 이벤트 기반: 에러 팝업 감지 → "에러 났네, 도움 줄까?"
3. 게임 감지: 게임 화면 → GAMING 무드 전환 + 리액션 모드

### 3-4. 작업 실행 (MCP + Computer Use)

**MCP 검문소 (보안 레이어):**
모든 MCP 실행은 화이트리스트 필터를 통과해야 합니다. AI가 직접 터미널을 건드리는 게 아니라, 허용된 명령만 통과시키는 검문소를 거칩니다.

```
하나가 명령 판단
    ↓
화이트리스트 검문소
    ├── 허용 목록에 있음 → 실행
    ├── 차단 목록에 있음 → 거부 + 하나에게 알림
    └── 위험 패턴 감지 (rm -rf, sudo 등) → 즉시 차단
    ↓
(선택) 오너 확인 요청
    "터미널에서 'git push origin main' 실행할까요? [확인/취소]"
    ↓
실제 실행
```

| 기능 | 도구 | Phase |
|------|------|-------|
| 파일 읽기/쓰기/검색 | mcp-server-filesystem | 4 |
| 터미널 명령 실행 | mcp-server-shell + 화이트리스트 필터 | 4 |
| 브라우저 자동화 | mcp-server-playwright | 4 |
| 웹 검색 | Serper MCP | 무료 2,500회/월. 카드 불필요. https://serper.dev |
| 구글 캘린더 | mcp-server-google-calendar | 4 |
| GitHub 연동 | mcp-server-github (선택) | 4 |
| MCP 실행 히스토리 | 모든 MCP 실행 내역 DB 저장. "저번에 어떤 명령 썼더라?" 질의 가능. | 4 |
| 마우스/키보드 제어 | pyautogui. 정해진 동작 실행. 뼈대만 구현 (모델 발전하면 자동으로 더 강력해짐). | 4 |
| 능동적 알림 | 일정 리마인더, 맥락 기반 먼저 말걸기. Celery 스케줄러. | 4 |
| 코드 실행 피드백 | 코드 실행 결과 받아서 디버깅 루프. | 4 |

> **pyautogui 전략:** 지금은 정해진 동작(앱 실행, 정해진 좌표 클릭)만 구현. 모델이 발전하면 비전 모델 판단 + pyautogui 실행으로 자동으로 더 강력해지는 구조.


> 3-5 게임 파트너 (Phase 6), 3-6 피드백&파인튜닝 (Phase 5) → [ROADMAP_ADVANCED.md](ROADMAP_ADVANCED.md)

### 3-7. 캐릭터 인터랙션 & UX

#### 기본 인터랙션

| 기능 | 설명 | Phase |
|------|------|-------|
| 창 드래그 이동 | 캐릭터 오버레이를 마우스로 드래그해서 화면 어디든 배치 가능 | 3 |
| 우클릭 컨텍스트 메뉴 | 캐릭터 우클릭 → 설정 열기 / 숨기기 / 종료 메뉴 | 3 |
| 캐릭터 클릭 반응 | 캐릭터 클릭 시 랜덤 짧은 리액션 말풍선 표시 | 3 |
| 팁 말풍선 | 조용히 있다가 가끔 짧은 팁/잡담을 말풍선으로 표시 (Celery 스케줄) | 4 |
| 능동적 말걸기 | 일정 시간 대화 없으면 하나가 먼저 짧게 말 걸기 (오너 상태 맥락 반영) | 4 |
| 테마 | 다크 / 라이트 모드. 말풍선/채팅창 색상 연동 | 3 |

#### 설정창 커스터마이징

오너가 하나의 정체성을 일부 조정할 수 있는 설정. 파인튜닝 전 기본 성격 조정 수단.

| 항목 | 설명 | 기본값 |
|------|------|--------|
| AI 이름 | 하나를 부르는 이름 (시스템 프롬프트에 주입) | "하나" |
| 오너 호칭 | 하나가 오너를 부르는 말 | "주인" → 오너 지정 가능 |
| 말투 강도 | 반말 기본 / 좀 더 격식 있게 / 더 친근하게 슬라이더 | 중간 |
| 관심사 태그 | 코딩 / 게임 / 음악 등 체크박스. 시스템 프롬프트에 추가됨 | 코딩, 게임 |
| 핫키 변경 | Alt+H 기본. 원하는 키로 변경 가능 | Alt+H |

> **구현 방식:** `data/persona.json` 저장 → 서버 재시작 없이 다음 `/chat` 요청부터 반영.
> 프론트 설정창 → `POST /settings/persona` → 서버가 시스템 프롬프트에 동적 주입.

#### 자율 행동 설정 토글

오너가 하나의 자율적 행동 범위를 제어할 수 있는 토글 목록. 기본값은 보수적(최소 자율).

| 토글 | 설명 | 기본값 |
|------|------|--------|
| 능동적 말걸기 | 조용할 때 하나가 먼저 말 거는 기능 ON/OFF | OFF |
| 팁 알림 | 랜덤 팁 말풍선 표시 ON/OFF | ON |
| 화면 인식 자동 반응 | 에러/게임 감지 시 하나가 자동으로 반응 ON/OFF | ON |
| 일정 리마인더 | 캘린더 연동 리마인더 알림 ON/OFF | OFF |
| 자율 크롤링 | 관심사 기반 새 정보 자동 검색 저장 ON/OFF | OFF |

> **구현:** `GET /settings/autonomous` → 현재 토글 상태 반환. `POST /settings/autonomous` → 토글 변경.
> `data/autonomous.json` 저장. Celery 태스크들이 이 설정을 읽고 동작 여부 판단.

#### 능동 알림 주기 규칙

프론트는 말풍선을 띄우기 전에 `POST /proactive/check`를 반드시 호출한다.
백엔드가 아래 규칙을 검사하고 허용/거부를 응답한다.

| 이벤트 | 주기 | 하루 최대 | 비고 |
|--------|------|-----------|------|
| 자리 비움 SLEEPY (`afk_sleepy`) | 제한 없음 | 제한 없음 | 복귀 시 `afk_return` 즉시 반응 |
| 야식 말풍선 (`night_snack`) | — | 1회 | 밤 11시 이후 첫 1회만 |
| 새벽 걱정 말풍선 (`late_night`) | — | 1회 | 새벽 2시 이후 첫 1회만 |
| 기분 체크 (`mood_check`) | — | 1회 | 하루 첫 대화 시 |
| 집중 모드 확인 (`focus_check`) | 30분 | 3회/세션 | 집중 모드 진입 후 |
| 작업 시간 알림 (`work_time_1h/3h/5h`) | 1h/3h/5h | 각 1회 | 세션당 |
| 자율 말 걸기 (`autonomous_talk`) | 최소 60분 | 10회 | 무시 3회 시 그날 중단 |
| 날씨 인사 (`weather_morning`) | — | 1회 | 하루 첫 실행 시 |
| 특별 날 이벤트 (`special_day`) | — | 1회 | 해당 날짜 |

추가 규칙:
```
오너 타이핑 중 → 모든 능동 알림 대기 (프론트 책임)
같은 주제 반복 → 하루 내 중복 없음 (백엔드 체크)
무시 3회 이상 → 당일 autonomous_talk 중단 (백엔드 체크)
```

---


> 3-8 감정 시스템 상세, 3-9 능동적 반응 (Phase 4+) → [ROADMAP_ADVANCED.md](ROADMAP_ADVANCED.md)

## 4. 시스템 아키텍처

### 4-1. 레이어 구조

```
┌──────────────────────────────────────────────────────────┐
│                   사용자 인터페이스 레이어                  │
│  [캐릭터 오버레이 창]  [채팅 오버레이 창]  [핫키 트리거]   │
│       (항상 위, 클릭통과)   (핫키 시 등장)                 │
└──────────────────────────┬───────────────────────────────┘
                           │ HTTP / IPC
┌──────────────────────────▼───────────────────────────────┐
│             코어 오케스트레이션 레이어 (FastAPI)            │
│  [요청 라우터] [컨텍스트 빌더] [액션 파서] [피드백 수집기]  │
│  [무드 엔진]   [MCP 검문소]                                │
└──────┬────────────────┬──────────────┬────────────────────┘
       │                │              │
┌──────▼──────┐  ┌──────▼──────┐  ┌───▼───────────────────┐
│  LLM 서비스  │  │  메모리 서비스│  │    도구 실행 서비스     │
│             │  │             │  │                        │
│ Ollama      │  │ mem0        │  │ MCP 검문소 (화이트리스트)│
│ Qwen3 14B   │  │ (장기기억)  │  │ ├── filesystem         │
│ (GGUF)      │  │             │  │ ├── shell              │
│             │  │ ChromaDB    │  │ ├── playwright         │
│ Qwen3 Vision│  │ (RAG 벡터)  │  │ ├── brave-search       │
│ (화면인식)  │  │             │  │ ├── google-calendar    │
│             │  │ SQLite      │  │ └── pyautogui          │
│             │  │ (대화/피드백)│  │                        │
└─────────────┘  │             │  │ OS 접근성 API          │
                 │ 망각 곡선   │  │ (화면 텍스트 추출)      │
                 │ confidence  │  └────────────────────────┘
                 │ decay       │
                 └─────────────┘
                       │
              ┌────────▼────────┐
              │  Celery + Redis  │
              │  (백그라운드)    │
              │ - 기억 추출      │
              │ - 자동 채점      │
              │ - 세션 요약      │
              │ - 하나 일기 작성 │
              │ - 능동적 알림    │
              │ - 망각 곡선 decay│
              │ - TTS 음성 생성  │
              └─────────────────┘
```

### 4-2. 요청 처리 흐름

```
[음성 입력 or 텍스트 입력]
    ↓ (음성인 경우) Whisper STT → 텍스트 변환
사용자 입력
    → DB 즉시 저장
    → mem0 장기기억 검색 (병렬)  ← 참조된 기억 confidence 상승
    → ChromaDB RAG 검색 (병렬)
    → 컨텍스트 빌드
      [시스템프롬프트 + 현재 무드 + 장기기억 + RAG결과 + 최근 대화]
    → Ollama SSE 스트리밍 추론
    → 액션 파서: 텍스트? or MCP 도구 호출?
        → 텍스트: 그대로 전달
        → 도구: MCP 검문소 → 통과 시 실행 → 결과 → 다시 LLM → 최종 응답
    → 응답 전달
    ↓ (음성 모드인 경우) Kokoro TTS → 음성 재생
    → 무드 엔진 업데이트 (응답 내용 기반)
    → 피드백 수집 (암묵적 자동 + 👍👎 선택)
    ↓ (Celery 비동기)
    → 새 사실 추출 → mem0 저장
    → Qwen3 4B 자동 채점 → DB 기록
```

### 4-3. 백그라운드 작업 (Celery + Redis)

```
즉각 처리 (FastAPI 메인)     백그라운드 처리 (Celery)
────────────────────────────────────────────────────
사용자 대화 응답             기억 추출 (mem0)
MCP 단순 실행               LLM 자동 채점
무드 업데이트               세션 요약
Whisper STT (실시간)        하나 일기 작성 (매일 자정)
                            능동적 알림 체크 (스케줄)
                            망각 곡선 decay (매일)
                            MCP 실행 히스토리 저장
                            Kokoro TTS 음성 생성
```

> Redis는 Celery 큐 + 세션 캐시 용도로 이중 활용.

### 4-4. 핵심 개념 구분

| 개념 | 설명 |
|------|------|
| Ollama | 실행 전용 런타임. GGUF 포맷. 파인튜닝 불가. `OLLAMA_KEEP_ALIVE=-1` 로 항상 메모리 상주. |
| HuggingFace | 학습 소스. safetensors 원본. 파인튜닝 후 GGUF 변환해서 Ollama에 등록. |
| LoRA 어댑터 | 베이스 모델 불변 + 어댑터(~200MB)만 교체. 모듈형 구조. |
| 장기 메모리 | 나라는 사람을 영구 기억. mem0 + SQLite. 망각 곡선 적용. |
| RAG | 지금 이 질문에 답하려고 문서 검색. ChromaDB. 장기메모리와 별개. |
| MCP | LLM의 손발. 실제 파일/인터넷/앱 실행 대행. 검문소 통과 필수. |
| 컨텍스트 | 지금 대화 RAM (휘발). 파인튜닝(영구)과 무관. |
| 무드 | 상황 기반 감정 상태. 시스템 프롬프트에 동적으로 주입됨. |
| Celery | FastAPI와 분리된 백그라운드 워커. 무거운 작업 비동기 처리. |

---

## 5. 기술 스택 & 환경

### 5-1. 스택 전체

| 레이어 | 기술 | 비고 |
|--------|------|------|
| 데스크탑 앱 | Electron + React | 크로스플랫폼. 오버레이 두 개(캐릭터/채팅) 분리. |
| 백엔드 API | Python 3.11 + FastAPI | 요청 라우팅, 오케스트레이션, 무드 엔진, MCP 검문소. |
| 백그라운드 워커 | Celery + Redis | 비동기 작업. 스케줄러. 세션 캐시. |
| LLM 런타임 | Ollama (`OLLAMA_KEEP_ALIVE=-1`) | 실행 전용. GGUF. 항상 메모리 상주. |
| LLM 모델 | Qwen3 14B (PC) / 32B (맥북) | HuggingFace 원본 → GGUF 변환 후 사용. |
| 소형 모델 | Qwen3 4B | 자동 채점, 기억 추출, 일기 작성 전용. |
| 장기 메모리 | mem0 + SQLite | 사용자 프로파일, 대화 요약. 망각 곡선 적용. |
| 벡터 DB | ChromaDB | RAG 전용. |
| 화면 인식 (텍스트) | pywinauto / pyobjc | OS 접근성 API. 에러/앱/창 텍스트 정확 추출. |
| 화면 인식 (맥락) | Qwen3 Vision | 맥락 파악 전용. 텍스트 추출 역할 없음. |
| 도구 실행 | MCP 서버들 + 화이트리스트 필터 | 파일/터미널/브라우저/검색/캘린더. |
| 마우스/키보드 | pyautogui | Computer Use 뼈대. 모델 발전 시 자동으로 강력해짐. |
| 마인크래프트 봇 | Mineflayer (Node.js) | Phase 6 전용. 로컬 서버 접속. |
| 파인튜닝 (PC) | Unsloth + QLoRA | RTX 4070 Ti Super + CUDA. |
| 파인튜닝 (맥북) | MLX-LM | Apple Silicon 전용. CUDA 없이 동작. |
| 음성 입력 (STT) | Whisper (로컬) | 한국어 실시간 인식. RTX 4070 Ti Super 처리 가능. |
| 음성 출력 (TTS) | Kokoro TTS | 로컬 경량 TTS. 자연스러운 한국어 음성. |
| 앱 패키징 | electron-builder | Electron + Python 번들링. Windows/macOS 빌드. |
| Python 번들링 | PyInstaller | FastAPI 서버를 단독 실행파일로 변환. venv 없이 실행 가능. |
| 테스트 환경 | Docker + docker-compose | 테스트 시 Redis/FastAPI 격리 실행. 환경 의존성 오염 방지. Ollama는 mock 대체. |

### 5-1-1. 모델 크기별 역할 분담

14B 모델로도 대부분의 기능이 동작하지만, 작업 복잡도에 따라 분담합니다.

| 작업 | 14B (PC) | 32B (맥북) | 비고 |
|------|----------|------------|------|
| 일반 대화, 잡담 | ✅ 충분 | — | |
| 코딩 도움, 디버깅 | ✅ 충분 | — | |
| 단순 MCP 판단 | ✅ 충분 | — | |
| 무드/감정 반응 | ✅ 충분 | — | 시스템 프롬프트로 커버 |
| 복잡한 멀티스텝 작업 | ⚠️ 가끔 실수 | ✅ 안정적 | |
| 긴 문서 RAG 요약 | ⚠️ 컨텍스트 희석 | ✅ 더 안정 | |
| 마인크래프트 자율 판단 | ⚠️ 단순 상황만 | ✅ 복잡 상황 | |
| Computer Use 판단 | ⚠️ 불안정 | ⚠️ 불안정 | 기술 자체가 미성숙 |

> **핵심 전략:** 14B로 일상 운영하다가 복잡한 작업은 오너가 방향 잡아줌.
> 파인튜닝 후 14B 성능이 올라오면 맥북 의존도 줄어듦.

### 5-2. 개발 환경

**PC (Windows) — 주 실행 환경**
- RAM: 64GB
- GPU: RTX 4070 Ti Super (VRAM 16GB) — Qwen3 14B 실행, Unsloth 파인튜닝
- IDE: PyCharm
- Python 환경: venv 또는 아나콘다
- Node: Electron + React + Mineflayer

**맥북 M4 Pro 16인치 48GB — 보조/대형모델 환경**
- 통합 메모리 48GB — Qwen3 32B 구동 가능 (약 10~15 t/s)
- 파인튜닝: MLX-LM (CUDA 없음, Unsloth 사용 불가)
- ⚠️ M4 Pro는 메모리 대역폭이 Max보다 낮아 LLM 추론 속도 제한 있음

### 5-3. 레포 구조 (목표)

```
hana/
├── AGENTS.md                  ← 이 파일. 단일 진실 공급원.
├── CHANGELOG.md               ← 버전별 작업 히스토리
├── README.md                  ← 설치/실행 방법
├── .gitignore                 ← data/ 반드시 포함
│
├── backend/                   ← Python FastAPI + Celery
│   ├── main.py
│   ├── celery_app.py          ← Celery 설정
│   ├── routers/
│   │   ├── chat.py
│   │   └── memory.py
│   ├── services/
│   │   ├── llm.py             ← Ollama SSE 스트리밍 연동
│   │   ├── memory.py          ← mem0 + SQLite + 망각 곡선
│   │   ├── rag.py             ← ChromaDB RAG
│   │   ├── mcp.py             ← MCP 서버 관리 + 검문소
│   │   ├── feedback.py        ← 피드백 수집/채점
│   │   ├── mood.py            ← 무드 엔진
│   │   ├── screen.py          ← OS API + Vision 화면 인식
│   │   ├── computer_use.py    ← pyautogui 래퍼
│   │   ├── voice_input.py     ← Whisper STT
│   │   └── voice_output.py    ← Kokoro TTS
│   ├── tasks/                 ← Celery 태스크
│   │   ├── memory_tasks.py    ← 기억 추출, 세션 요약
│   │   ├── score_tasks.py     ← 자동 채점
│   │   ├── diary_tasks.py     ← 하나 일기 작성
│   │   ├── alert_tasks.py     ← 능동적 알림
│   │   └── decay_tasks.py     ← 망각 곡선 decay
│   ├── models/
│   │   └── schema.py          ← DB 스키마 정의
│   └── requirements.txt
│
├── frontend/                  ← Electron + React
│   ├── electron/
│   │   └── main.js            ← 창 관리, 핫키, 트레이
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── CharacterOverlay.jsx  ← 항상 위, 클릭통과
│   │   │   ├── ChatOverlay.jsx       ← 핫키 시 등장
│   │   │   ├── SpeechBubble.jsx      ← 말풍선
│   │   │   └── Settings.jsx
│   │   └── styles/
│   └── package.json
│
├── minecraft/                 ← Phase 6: Mineflayer 봇
│   ├── bot.js
│   └── package.json
│
├── assets/                    ← 캐릭터 이미지, 무드별 이미지
│
├── finetune/                  ← 파인튜닝 스크립트
│   ├── filter_data.py
│   ├── convert_jsonl.py
│   ├── train_unsloth.py       ← PC용
│   ├── train_mlx.py           ← 맥북용
│   └── export_gguf.py
│
└── data/                      ← 로컬 데이터 (gitignore 필수)
    ├── hana.db                ← SQLite
    ├── chroma/                ← ChromaDB
    ├── diary/                 ← 하나 일기
    │   └── 2026-03-17.md
    └── adapters/              ← LoRA 어댑터 버전들
        └── hana-lora-v1.safetensors
```

> ⚠️ `data/` 디렉토리는 반드시 `.gitignore`에 포함. 개인 대화 데이터 절대 커밋 금지.


> 5-4 빌드&패키징 (Phase 7) → [ROADMAP_ADVANCED.md](ROADMAP_ADVANCED.md)

## 6. DB 스키마

> ⚠️ Phase 1 시작 전 확정 필요. 이후 변경 시 마이그레이션 필요.

### conversations
```sql
CREATE TABLE conversations (
    id              TEXT PRIMARY KEY,   -- UUID
    started_at      TIMESTAMP NOT NULL,
    ended_at        TIMESTAMP,
    session_summary TEXT                -- 세션 종료 시 자동 요약 (Celery)
);
```

### messages
```sql
CREATE TABLE messages (
    id                  TEXT PRIMARY KEY,   -- UUID
    conversation_id     TEXT NOT NULL REFERENCES conversations(id),
    role                TEXT NOT NULL,      -- 'user' | 'assistant' | 'system'
    content             TEXT NOT NULL,
    interaction_type    TEXT,               -- 'coding' | 'chat' | 'task' | 'search' | 'game'
    mood_at_response    TEXT,               -- 응답 시 하나의 무드
    owner_emotion       TEXT,               -- 오너 감정 추정 (분석 결과). 파인튜닝 컨텍스트 활용.
    response_time_ms    INTEGER,            -- 응답 생성 소요 시간
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### feedback
```sql
CREATE TABLE feedback (
    message_id      TEXT PRIMARY KEY REFERENCES messages(id),
    explicit_score  INTEGER,    -- 1~5, nullable (👍=5, 👎=1)
    implicit_signal TEXT,       -- 'follow_up' | 'retry' | 'executed' | 'ignored'
    auto_score      REAL,       -- Qwen3 4B 자동 채점 0.0~1.0
    final_score     REAL        -- 종합 점수. 파인튜닝 필터 기준값.
);
```

### memory_facts
```sql
CREATE TABLE memory_facts (
    id                  TEXT PRIMARY KEY,   -- UUID
    fact                TEXT NOT NULL,      -- mem0 추출 사실
    embedding           BLOB,               -- 벡터 (ChromaDB 연동)
    source_message_id   TEXT REFERENCES messages(id),
    confidence          REAL DEFAULT 1.0,   -- 기억 신뢰도 (망각 곡선)
    reference_count     INTEGER DEFAULT 0,  -- 참조 횟수
    last_referenced     TIMESTAMP,          -- 마지막 참조 시각
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### mcp_history
```sql
CREATE TABLE mcp_history (
    id              TEXT PRIMARY KEY,   -- UUID
    tool            TEXT NOT NULL,      -- 'filesystem' | 'shell' | 'browser' 등
    command         TEXT NOT NULL,      -- 실행된 명령
    result          TEXT,               -- 실행 결과 요약
    approved        BOOLEAN DEFAULT 1,  -- 검문소 통과 여부
    executed_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### minecraft_actions
```sql
CREATE TABLE minecraft_actions (
    id              TEXT PRIMARY KEY,   -- UUID
    action_type     TEXT NOT NULL,      -- 'move' | 'chat' | 'collect' | 'combat' | 'build'
    context         TEXT,               -- 행동 당시 환경 상태 (JSON)
    action          TEXT NOT NULL,      -- 실행한 행동 내용
    result          TEXT,               -- 행동 결과
    reward_signal   REAL,               -- 긍정(+) / 부정(-) 피드백. 미래 RL 학습용.
    executed_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```
> **RL 확장 준비:** reward_signal 컬럼이 나중에 강화학습 데이터로 활용됨.

### 망각 곡선 decay 쿼리 (매일 Celery 실행)
```sql
-- 7일 이상 참조 안 된 기억의 confidence 감소
UPDATE memory_facts
SET confidence = confidence * 0.97
WHERE last_referenced < datetime('now', '-7 days')
  AND confidence > 0.1;  -- 최소값 유지

-- 참조 시 confidence 상승
UPDATE memory_facts
SET confidence = MIN(1.0, confidence + 0.1),
    reference_count = reference_count + 1,
    last_referenced = CURRENT_TIMESTAMP
WHERE id = ?;
```

### 파인튜닝 필터 쿼리 (Layer 1 소스)
```sql
SELECT m.*, f.final_score
FROM messages m
JOIN feedback f ON m.id = f.message_id
WHERE f.final_score >= 0.7
  AND m.role = 'assistant'
  AND LENGTH(m.content) > 50
  AND m.interaction_type IS NOT NULL
ORDER BY f.final_score DESC;
```
> 이 쿼리 결과가 `hana_dataset_message` (ChromaDB Layer 1) 에 자동 저장된다.

### ChromaDB 컬렉션 구조 (Phase 4~5)

| 컬렉션 | 용도 | 수집 시점 | decay |
|--------|------|----------|-------|
| `hana_memory_volatile` | 단기 휘발 기억 | 매 대화 | 7일 후 LLM 압축 → longterm |
| `hana_memory_longterm` | 장기 영구 기억 (오너 정보) | 승격 시 | confidence 0.97배/주 |
| `hana_experience` | 하나 경험 기록 | 매 대화 종료 | — |
| `hana_preference` | 선호 신뢰도 (런타임 인격) | 세션 종료 시 | confidence 0.2 미만 소멸 |
| `hana_dataset_message` | 파인튜닝 데이터 Layer 1 | final_score >= 0.7 즉시 | — |
| `hana_dataset_session` | 파인튜닝 데이터 Layer 2 | 세션 종료 시 | — |
| `hana_dataset_final` | 파인튜닝 통합 데이터 | Phase 5 수동 실행 | — |

> HNSW cosine similarity 설정: `hnsw:space=cosine, M=16, construction_ef=100`
> 모든 컬렉션 공통 적용. 중복 제거 임계값: cosine distance < 0.08 (유사도 > 0.92)

---


## 7. 개발 로드맵

> Phase 5-7.5 상세 로드맵 → [ROADMAP_ADVANCED.md](ROADMAP_ADVANCED.md)

### Phase 1-4.5 완료 (상세 이력 → HISTORY.md)

| Phase | 목표 | 상태 |
|-------|------|------|
| Phase 1 | FastAPI + SSE 스트리밍 채팅 + SQLite DB | ✅ 완료 |
| Phase 2 | mem0 장기기억 + ChromaDB RAG + 망각 곡선 | ✅ 완료 |
| Phase 3 | Electron 오버레이 + 무드 시스템 + 설정 UI | ✅ 완료 |
| Phase 4 | 자아 형성 파이프라인 + TTS 엔진 추상화 + 능동 알림 | ✅ 완료 |
| Phase 4.5 | Whisper STT + Kokoro/Edge TTS 음성 파이프라인 | ✅ 완료 |

### Phase 5 이후 (미시작)
- Phase 5: LoRA 파인튜닝 (진입 조건: dataset_message 500개 이상)
- Phase 6: 마인크래프트 봇 (Mineflayer)
- Phase 7: 빌드 & 패키징 (electron-builder + PyInstaller)
- Phase 7.5: 법적 준수 & 면책 정리

---

> 8. 파인튜닝 전략 상세 → [ROADMAP_ADVANCED.md](ROADMAP_ADVANCED.md)

## 9. 에이전트 협업 규칙

이 프로젝트는 **Claude (기획/설계/리뷰/다음 지시사항 작성)**, **Claude Code (구현)**, **ChatGPT Codex (구현)**, **오너 (최종 의사결정)** 가 함께 작업합니다.

### 9-0. 에이전트 고정 역할 분담

> ⚠️ 이 분담은 고정입니다. 역할 바꾸지 마세요.

| 에이전트 | 역할 | 담당 디렉토리 | 절대 건드리지 않는 것 |
|----------|------|--------------|----------------------|
| **Claude (웹)** | 기획 / 설계 / 리뷰 / 지시사항 작성 | 없음 (코드 작성 안 함) | — |
| **Claude Code** | 백엔드 전담 | `backend/` | `frontend/` |
| **Codex** | 프론트엔드 전담 | `frontend/` | `backend/` |
| **오너** | 최종 의사결정 / 환경 세팅 / 테스트 | — | — |

```
Claude Code = backend/ 만 건드림
Codex       = frontend/ 만 건드림
AGENTS.md   = 둘 다 읽고 업데이트함
```

> **파일 로딩 방식:**
> - `CLAUDE.md` → Claude Code가 레포 열 때 **자동으로** 읽음
> - `CODEX.md` → 자동으로 읽히지 않음. Codex에게 작업 시킬 때 **프롬프트 앞에 직접 붙여넣기** 필요
> - `AGENTS.md` → 두 에이전트 모두 명시적으로 읽도록 프롬프트에 지시

---

### 9-1. API 계약서 (Interface Contract)

> 📄 **상세 계약서는 별도 파일로 분리되었습니다: [`API_CONTRACT.md`](API_CONTRACT.md)**
>
> ⚠️ 이 계약서는 백엔드와 프론트가 서로 상의 없이 독립 작업하기 위한 약속입니다.
> Claude Code는 이대로 만들고, Codex는 이대로 호출합니다. 임의로 변경 금지.
> 변경이 필요하면 반드시 Claude (웹)에게 먼저 알리고 **API_CONTRACT.md** 업데이트 후 작업.

#### 엔드포인트 요약

| 메서드 | 경로 | 설명 | Phase |
|--------|------|------|-------|
| POST | /chat | 대화 (SSE 스트리밍) | 1 |
| GET | /history | 대화 히스토리 조회 | 1 |
| GET | /conversations | 세션 목록 조회 | 1 |
| POST | /feedback | 피드백 전송 | 1 |
| GET | /mood | 현재 무드 조회 | 3 |
| GET | /mood/stream | 무드 변경 SSE 푸시 | 3 |
| GET | /settings/models | 캐릭터 모델 목록 조회 | 3 |
| POST | /settings/models/select | 캐릭터 모델 변경 | 3 |
| GET | /settings/llm/models | LLM 모델 목록 조회 | 3 |
| POST | /settings/llm/select | LLM 챗 모델 변경 | 3 |
| GET | /settings/persona | 페르소나 설정 조회 | 3 |
| POST | /settings/persona | 페르소나 설정 변경 | 3 |
| POST | /settings/persona/preview | 말투 샘플 생성 | 3 |
| GET | /settings/autonomous | 자율 행동 토글 조회 | 3 |
| POST | /settings/autonomous | 자율 행동 토글 변경 | 3 |
| POST | /proactive/check | 능동 알림 주기 체크 | 4 |
| POST | /proactive/ignored | 오너 무시 기록 | 4 |
| GET | /proactive/status | 오늘 능동 알림 현황 | 4 |
| POST | /voice/stt | 음성 → 텍스트 | 4.5 |
| POST | /voice/tts | 텍스트 → 음성 | 4.5 |

> 상세 요청/응답 형식 → **[API_CONTRACT.md](API_CONTRACT.md)**

### 9-2. 브랜치 전략
> **main PR 자격 규칙:** `dev`에서 통합과 검증이 끝나고, 에러가 없다는 확인이 완료되어야만 `main` 브랜치 PR을 올릴 수 있습니다.
> `main`은 최신이라고 해서 바로 기준으로 삼는 브랜치가 아니라, `dev` 검증 통과 후에만 올라가는 최종 승격 브랜치입니다.

```
main          ← 검증된 코드만. 직접 푸시 금지.
dev           ← 통합 브랜치. 여기서 테스트 후 main PR.
claude/*      ← Claude Code 작업 브랜치.
codex/*       ← Codex 작업 브랜치.
```

### 9-3. 브랜치 네이밍
```
{에이전트}/{phase}-{기능}
예: claude/phase1-fastapi-server
    codex/phase1-electron-ui
    claude/phase2-memory-pipeline
    claude/phase4-mcp-whitelist
```

### 9-4. 파일 소유권 원칙
작업 시작 전 `[10. 현재 상태]` 섹션에 담당 파일 명시. 동시에 같은 파일 금지.

### 9-5. 작업 전 체크리스트
```
□ 이 문서(AGENTS.md) 전체 읽기
□ [10. 현재 상태] 섹션 확인 및 파일 소유권 확인
□ 내 브랜치 생성: git checkout dev && git pull && git checkout -b {브랜치명}
□ 담당 파일 이 문서 section 10에 기록
□ 작업 시작
```

### 9-6. 작업 후 체크리스트
> 상세 체크리스트는 CLAUDE.md / CODEX.md의 Pre-PR Checklist를 따를 것.
> 아래는 AGENTS.md 업데이트 기준.
> `main` PR은 `dev` 통합 검증이 완료되고 에러가 없다는 확인 전에는 금지.
```
□ 테스트 통과 확인 (pytest / npm test)
□ 이 문서 [10. 현재 상태] 업데이트
□   - 완료된 태스크 체크
□   - 담당 파일 소유권 해제
□   - 다음 작업자를 위한 브리핑 작성
□ 커밋 메시지 규칙 준수 (9-7 참고)
□ dev로 PR
```

### 9-7. 커밋 메시지 규칙
```
{타입}: {내용}

feat     새 기능
fix      버그 수정
refactor 리팩토링
docs     문서 수정 (AGENTS.md 포함)
chore    설정, 패키지 등

예: feat: FastAPI /chat SSE 스트리밍 구현
    feat: Celery + Redis 백그라운드 작업 구조
    docs: AGENTS.md Phase 1 태스크 업데이트
    fix: Ollama keep-alive 설정 누락 수정
```

### 9-8. Claude (웹)의 역할
- 매 세션 시작 시 이 문서 기준으로 현황 파악
- 다음 작업 지시사항 작성 (Claude Code / Codex 프롬프트 포함)
- 코드 리뷰 및 아키텍처 결정
- 이 문서 지속 업데이트
- **직접 GitHub 접근 불가. 파일 전달은 오너가 직접 커밋.**

---


## 10. 현재 상태 & 다음 지시사항

> 📄 **작업 상태, Phase 진행, 에이전트 브리핑은 별도 파일로 분리되었습니다: [`STATUS.md`](STATUS.md)**
>
> ⚠️ 에이전트 간 소통은 **STATUS.md** 에서만 이루어집니다.
> 작업 전 STATUS.md를 반드시 읽고, 작업 후 반드시 업데이트하세요.
