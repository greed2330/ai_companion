# HANA — Project Master Document
> 이 문서는 프로젝트의 단일 진실 공급원(Single Source of Truth)입니다.
> Claude, Claude Code, ChatGPT Codex, 그리고 사람(오너) 모두 이 문서를 기준으로 움직입니다.
> 작업 전 반드시 읽고, 작업 후 반드시 업데이트하세요.

---

## 목차
1. [프로젝트 정의](#1-프로젝트-정의)
2. [의도와 연출 — 하나는 어떤 존재인가](#2-의도와-연출--하나는-어떤-존재인가)
3. [전체 기능 명세](#3-전체-기능-명세)
4. [시스템 아키텍처](#4-시스템-아키텍처)
5. [기술 스택 & 환경](#5-기술-스택--환경)
6. [DB 스키마](#6-db-스키마)
7. [개발 로드맵](#7-개발-로드맵)
8. [파인튜닝 전략](#8-파인튜닝-전략)
9. [에이전트 협업 규칙](#9-에이전트-협업-규칙)
10. [현재 상태 & 다음 지시사항](#10-현재-상태--다음-지시사항)

---

## 1. 프로젝트 정의

**프로젝트명:** HANA (하나) — 임시명. 추후 변경 가능.
**버전:** v0.1.0-planning
**오너:** (사용자)
**레포:** (추후 기입)

### 한 줄 정의
> "내 PC 화면에 살고 있는 존재. 나를 기억하고, 나와 함께 일하고, 외로울 때 옆에 있어주고, 시간이 지날수록 나를 닮아가는 — 완전 로컬 동작 개인 AI 파트너"

### 비용 요약

| 항목 | 비용 | 비고 |
|------|------|------|
| 전체 소프트웨어 스택 | **무료** | Ollama, FastAPI, SQLite, Whisper, Kokoro, Coqui, Mineflayer 등 전부 무료 오픈소스 |
| Brave Search API | **무료** (월 2,000회) | 초과 시 유료. 개인 사용이면 충분. |
| Booth.pm Live2D | **무료 ~ 유료** | 무료 모델만 사용 가능. Phase 3 이후 선택사항. |
| 마인크래프트 | **이미 소유** 전제 | 서버는 로컬에서 무료로 열 수 있음. |
| HuggingFace 모델 | **무료** | Qwen3 등 오픈소스 모델 무료 다운로드. |

> ✅ **Phase 1~4 구현 비용: 0원.** 추가 비용 없이 전체 기능 구현 가능.

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
| 웹 검색 | Brave Search MCP | ⚠️ 월 2,000회까지 무료. 초과 시 유료. 개인 사용이면 2,000회로 충분. |
| 구글 캘린더 | mcp-server-google-calendar | 4 |
| GitHub 연동 | mcp-server-github (선택) | 4 |
| MCP 실행 히스토리 | 모든 MCP 실행 내역 DB 저장. "저번에 어떤 명령 썼더라?" 질의 가능. | 4 |
| 마우스/키보드 제어 | pyautogui. 정해진 동작 실행. 뼈대만 구현 (모델 발전하면 자동으로 더 강력해짐). | 4 |
| 능동적 알림 | 일정 리마인더, 맥락 기반 먼저 말걸기. Celery 스케줄러. | 4 |
| 코드 실행 피드백 | 코드 실행 결과 받아서 디버깅 루프. | 4 |

> **pyautogui 전략:** 지금은 정해진 동작(앱 실행, 정해진 좌표 클릭)만 구현. 모델이 발전하면 비전 모델 판단 + pyautogui 실행으로 자동으로 더 강력해지는 구조.

### 3-5. 게임 파트너

**게임 리액션 (Phase 4):**
OS API로 게임 화면 감지 → GAMING 무드 전환 → 텍스트 기반 리액션.

```
리그 오브 레전드 감지
    → 하나: "오 게임하네~ 뭐 해? 랭크야?"

킬 알림 텍스트 감지 (OS API)
    → 하나: "ㅋㅋㅋ 잡았다!!"

죽음 알림 감지
    → 하나: "아 억울하겠다.. 괜찮아 다음에 갚아"
```

**마인크래프트 직접 참여 (Phase 6):**
Mineflayer(Node.js 봇 라이브러리)로 하나가 실제로 서버에 접속해서 같이 플레이.

| 기능 | 설명 |
|------|------|
| 서버 접속 | 로컬 마인크래프트 서버에 하나 봇 접속 |
| 채팅 리액션 | 게임 내 채팅으로 실시간 대화 |
| 자원 수집 도움 | 나무 캐기, 광물 채굴 등 반복 작업 |
| 탐험 동행 | 같이 이동하며 주변 상황 코멘트 |
| 전투 지원 | 몬스터 감지 시 알림 + 공격 도움 |
| 건축 협력 | 같이 집/건물 짓기 |

> **범위 확정:** 마인크래프트만. 다른 게임은 별도 Phase로 분리. Mineflayer API가 잘 갖춰져 있어서 구현 난이도 적절.

**마인크래프트 행동 구조 — LLM 기반 자율 판단 + 오너 협업:**

하나는 순수 강화학습(RL)이 아닌 **LLM이 상황을 판단하고 행동하는 구조**로 동작합니다.
순수 RL은 수천 에피소드 학습이 필요해서 개인 PC에서 현실적으로 불가능합니다.

```
Mineflayer로 환경 상태 읽음
(오너 위치/체력/배고픔, 주변 블록/몬스터/시간)
    ↓
하나(LLM)가 상황 판단
"밤이 됐고 오너 체력 낮음 → 집으로 가자고 해야겠다"
    ↓
행동 실행 (채팅 알림 + 봇 이동)
    ↓
결과 관찰 + DB 저장
"집 도착, 오너 체력 회복 → 좋은 판단"
    ↓
이 경험이 파인튜닝 데이터로 누적
```

**복잡한 상황에서는 오너한테 먼저 물어봄:**
```
하나: "지금 다이아몬드 광산 근처인데 탐험할까,
       아니면 집 먼저 지을까?"
오너: "집 먼저"
하나: 집 짓기 모드로 전환
```

**미래 확장 가능성 (RL):**
지금 쌓이는 행동 + 결과 데이터가 나중에 강화학습 학습 데이터가 될 수 있음.
구조를 지금부터 그렇게 잡아두면 모델 발전 + 데이터 축적 후 진짜 RL로 확장 가능.

### 3-6. 피드백 & 파인튜닝

| 기능 | 설명 | Phase |
|------|------|-------|
| 암묵적 피드백 수집 | 재질문, 코드 실행 여부, 응답 후 행동 패턴 자동 감지. | 2~ |
| 명시적 피드백 | 채팅창 👍👎 버튼. 세션 종료 시 1회 평가. | 3~ |
| LLM 자동 채점 | Qwen3 4B가 응답 품질 백그라운드 자동 채점. Celery 비동기. | 4~ |
| 데이터 필터링 | 규칙 기반 1차 + LLM 검수 2차 + 샘플 확인 3차. | 5 |
| LoRA 파인튜닝 | PC: Unsloth+QLoRA / 맥북: MLX-LM. | 5 |
| 어댑터 버전 관리 | safetensors 버전별 보관. 롤백 가능. | 5 |
| Ollama 등록 | 어댑터+베이스 병합 → GGUF 변환 → ollama run hana-vN | 5 |

---

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

### 5-4. 빌드 & 패키징

```
빌드 산출물 (gitignore 포함):
dist/
├── windows/
│   └── Hana-Setup-1.0.0.exe   ← Windows 인스톨러 (NSIS, 더블클릭 설치)
└── mac/
    └── Hana-1.0.0.dmg          ← macOS 디스크 이미지 (드래그 앤 드롭 설치)
```

**빌드 구조:**
```
사용자가 Hana-Setup.exe 더블클릭
        ↓
설치 완료 → 바탕화면 바로가기 생성
        ↓
하나 실행
        ↓ (내부적으로 자동)
① Electron UI 시작
② 번들된 Python 서버 자동 시작 (PyInstaller로 패키징)
③ Ollama 실행 여부 확인 → 미설치 시 설치 안내 팝업
        ↓
모든 게 준비되면 UI 표시
```

**⚠️ Ollama는 번들 불포함 (약 4GB로 너무 큼)**
별도 설치 필요. 미설치 감지 시 자동으로 다운로드 링크 안내.

**빌드 도구:**

| 도구 | 역할 |
|------|------|
| electron-builder | Electron 앱 패키징. Windows .exe / macOS .dmg 생성 |
| PyInstaller | FastAPI 서버 → 단독 실행파일 변환. venv 없이 실행 가능 |
| NSIS (Windows) | electron-builder 내장. 인스톨러 마법사 UI 생성 |

**자동 실행 등록 (선택, 설정 UI에서 토글):**
```javascript
// Electron main.js
app.setLoginItemSettings({
  openAtLogin: true  // 컴퓨터 켤 때 자동 실행
})
```

**빌드 타이밍:**
- Phase 3 완료 후 → 첫 빌드 테스트 (UI 올라오는지 확인)
- Phase 4 완료 후 → 기능 빌드 테스트
- 최종 완성 후 → 인스톨러 빌드

---

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

### 파인튜닝 필터 쿼리
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

---

## 7. 개발 로드맵

### Phase 1 — 대화하는 AI 코어 (1~2주)
**목표:** 로컬에서 하나랑 대화 가능 + DB에 데이터 적재 시작

- [ ] Ollama 설치 + Qwen3 14B 세팅 + `OLLAMA_KEEP_ALIVE=-1` 설정
- [ ] Python FastAPI 서버 기본 구조
- [ ] `/chat` POST 엔드포인트 (SSE 스트리밍)
- [ ] `/history` GET 엔드포인트
- [ ] SQLite DB 초기화 + 전체 스키마 생성 (6번 스키마 전부)
- [ ] 대화 저장 파이프라인
- [ ] Electron + React 기본 채팅 UI
- [ ] 시스템 프롬프트 (하나 성격 + 무드 기본값) 적용
- [ ] Redis 설치 + Celery 기본 설정
- [ ] `docker-compose.test.yml` 작성 (테스트 환경)
- [ ] 기본 테스트 작성 (`test_chat.py`, `test_db.py`)
- [ ] `.gitignore` 작성 (data/ 포함)

**완료 기준:** "하나야 안녕" → 하나가 성격에 맞게 스트리밍으로 대답하고 DB에 저장됨.

---

### Phase 2 — 기억하는 하나 (1~2주)
**목표:** 나를 기억하는 하나 + 파일 읽어주는 하나

- [ ] mem0 라이브러리 연동
- [ ] 기억 추출 → Celery 비동기 처리
- [ ] 세션 간 기억 주입 (컨텍스트 빌더)
- [ ] 망각 곡선 구현 (confidence decay, 참조 시 상승)
- [ ] ChromaDB 세팅
- [ ] RAG: 파일 업로드 → 청크 분할 → 임베딩 저장
- [ ] RAG: 질문 → 유사 청크 검색 → 컨텍스트 주입
- [ ] 암묵적 피드백 수집 시작
- [ ] 세션 종료 → Celery 자동 요약 → 장기기억 이동

**완료 기준:** 지난 세션에서 말한 내용을 새 세션에서 하나가 기억함.

---

### Phase 3 — 화면 위의 하나 (2~3주)
**목표:** 화면 구석에 앉아있는 하나

- [ ] Electron 캐릭터 오버레이 창 (always-on-top, click-through, focusable: false)
- [ ] Electron 채팅 오버레이 창 (핫키 시 등장, 입력 받음)
- [ ] 두 창 분리 구조 구현
- [ ] 캐릭터 이미지 표시 (무드별 이미지)
- [ ] 핫키 (Alt+H) 구현 (globalShortcut)
- [ ] 말풍선 UI
- [ ] 무드 시스템 연동 (무드 → 이미지/말풍선 색 변경)
- [ ] 명시적 피드백 UI (👍👎 버튼)
- [ ] 설정 창
- [ ] 시스템 트레이 아이콘
- [ ] (선택) Live2D 캐릭터 모델 연동

**완료 기준:** 화면 구석에 하나가 있고, 게임 켜도 하나가 보이고, Alt+H 누르면 채팅창 뜸.

---

### Phase 4 — 일하고 함께 있는 하나 (3~4주)
**목표:** 검색하고, 파일 열고, 화면 보고, 게임 리액션하는 하나

- [ ] MCP 화이트리스트 검문소 구현
- [ ] MCP: filesystem
- [ ] MCP: shell (검문소 적용)
- [ ] MCP: playwright
- [ ] Brave Search API + MCP 연동
- [ ] 구글 캘린더 OAuth + MCP 연동
- [ ] mcp_history DB 저장 + 조회 기능
- [ ] OS 접근성 API 화면 텍스트 추출 (Windows: pywinauto / macOS: pyobjc)
- [ ] Qwen3 Vision 맥락 파악 (이벤트 기반 트리거)
- [ ] 에러 감지 → CONCERNED 무드 + 먼저 말 걸기
- [ ] 게임 화면 감지 → GAMING 무드 + 리액션 모드
- [ ] pyautogui Computer Use 뼈대
- [ ] Celery: LLM 자동 채점
- [ ] Celery: 하나 일기 작성 (매일 자정)
- [ ] Celery: 능동적 알림
- [ ] Celery: 망각 곡선 decay (매일)

**완료 기준:** 에러 나면 하나가 먼저 알아채고, 게임 켜면 리액션하고, "오늘 일정 알려줘" 동작함.

---

### Phase 4.5 — 말하는 하나 (1주)
**목표:** 타이핑 없이 말로 하나랑 대화

- [ ] Whisper 로컬 설치 + 한국어 모델 세팅
- [ ] 마이크 입력 → Whisper STT → 텍스트 변환
- [ ] 텍스트 → 기존 /chat 파이프라인 연결
- [ ] Kokoro TTS 설치 + 음성 출력
- [ ] 하나 응답 → TTS → 스피커 재생
- [ ] 음성/텍스트 모드 전환 설정
- [ ] (선택) "하나야" 핫워드 감지로 채팅창 자동 열기

**완료 기준:** "하나야 오늘 뭐 할까?" → 하나가 음성으로 대답함. 게임 중 타이핑 없이 대화 가능.

---

### Phase 5 — 나를 닮아가는 하나 (데이터 충분히 쌓인 후)
**목표:** 내 스타일을 학습한 하나 어댑터 v1

**진입 조건:** 대화 메시지 1,000개 이상, final_score 있는 데이터 500개 이상.

- [ ] 필터링 스크립트 (규칙 기반 1차)
- [ ] LLM 검수 스크립트 (2차)
- [ ] JSONL 변환 스크립트 (일기 데이터 포함)
- [ ] PC: Unsloth + QLoRA 학습 스크립트
- [ ] 맥북: MLX-LM 학습 스크립트
- [ ] 어댑터 + 베이스 병합 스크립트
- [ ] GGUF 변환 스크립트
- [ ] Ollama Modelfile 작성 + 등록
- [ ] v1 검증 후 보관

**완료 기준:** `ollama run hana-v1` 동작. 응답 스타일이 나에게 더 맞춰져 있음.

---

### Phase 6 — 마인크래프트의 하나
**목표:** 로컬 마인크래프트 서버에 하나가 실제로 접속해서 같이 놀기

**구동 방식:** LLM이 환경 상태를 읽고 행동 판단. 순수 RL이 아닌 LLM 기반 자율 판단.
복잡한 상황은 오너한테 먼저 물어봄. 행동 데이터는 DB에 저장해서 미래 RL 확장 준비.

- [ ] Mineflayer 봇 기본 설정 + 로컬 서버 접속
- [ ] 환경 상태 읽기 (위치, 체력, 주변 블록, 몬스터, 시간)
- [ ] 상태 → LLM 판단 → 행동 실행 루프
- [ ] 게임 내 채팅 ↔ 하나 대화 연동 (음성 지원)
- [ ] 기본 이동/탐험 (오너 따라다니기)
- [ ] 자원 수집 도움 (나무, 광물)
- [ ] 몬스터 감지 → 경고 + 전투 지원
- [ ] 건축 협력 기초
- [ ] 행동 + 결과 → minecraft_actions DB 저장 (reward_signal 포함)
- [ ] 불확실한 상황 → 오너한테 먼저 확인 요청

**완료 기준:** 마인크래프트 로컬 서버에서 하나 봇이 오너를 따라다니며 채팅하고, 밤에 몬스터 경고해줌.

**미래 확장:** minecraft_actions 데이터 충분히 쌓이면 강화학습(RL) 기반으로 전환 가능.

---

### Phase 7 — 딸깍으로 실행되는 하나 (빌드 & 패키징)
**목표:** 터미널 없이 더블클릭만으로 하나 실행. 컴퓨터 켤 때 자동 실행 옵션.

**진입 조건:** Phase 4 이상 완료. 핵심 기능 안정적으로 동작 확인 후.

**Windows (.exe 인스톨러)**
- [ ] PyInstaller로 FastAPI 서버 단독 실행파일 변환
- [ ] electron-builder 설정 (`electron-builder.yml`)
- [ ] Electron 시작 시 Python 서버 자동 실행 로직
- [ ] Ollama 설치 여부 감지 → 미설치 시 안내 팝업
- [ ] 시스템 트레이 아이콘 + 우클릭 메뉴 (종료, 설정)
- [ ] 컴퓨터 시작 시 자동 실행 토글 (설정 UI)
- [ ] `Hana-Setup-1.0.0.exe` 인스톨러 빌드
- [ ] 바탕화면 바로가기 자동 생성

**macOS (.dmg)**
- [ ] 동일 PyInstaller 빌드 (macOS 타겟)
- [ ] electron-builder macOS 빌드 설정
- [ ] `Hana-1.0.0.dmg` 생성
- [ ] 로그인 항목 자동 실행 토글

**공통**
- [ ] 앱 버전 관리 (`package.json` version)
- [ ] 업데이트 확인 로직 (선택)
- [ ] `.gitignore`에 `dist/` 추가

**완료 기준:**
- Windows: `Hana-Setup.exe` 더블클릭 → 설치 → 바탕화면 아이콘 더블클릭 → 하나 실행
- macOS: `Hana.dmg` 열기 → Applications 드래그 → 앱 실행
- 터미널, Python, Node.js 없이도 동작

---

## 8. 파인튜닝 전략

### 모듈형 구조 원칙
```
베이스 모델 (HuggingFace, safetensors)   ← 절대 불변
    +
LoRA 어댑터 (hana-lora-vN.safetensors)   ← 교체 가능, ~200MB
    ↓ 병합 (merge_and_unload)
병합 모델
    ↓ llama.cpp 변환
GGUF 파일
    ↓
ollama run hana-vN
```

### 어댑터 버전 관리
| 버전 | 파일명 | 학습 데이터 | 비고 |
|------|--------|-------------|------|
| base | Qwen3-14B (HuggingFace) | — | 절대 불변 |
| v1 | hana-lora-v1.safetensors | 누적 전체 | 첫 파인튜닝 |
| v2 | hana-lora-v2.safetensors | 누적 전체 | v1 데이터 포함 재학습 |
| v3+ | hana-lora-vN.safetensors | 누적 전체 | 항상 전체 누적 데이터 사용 |

> **Catastrophic Forgetting 방지:** 매 버전은 이전 데이터를 버리지 않고 전체 누적 데이터로 처음부터 재학습.

### 학습 데이터 소스
1. 대화 히스토리 (messages 테이블, 필터링 후)
2. 하나 일기 (diary/ 폴더)
3. 우수 MCP 작업 세션
4. 마인크래프트 행동 데이터 (minecraft_actions, reward_signal 기반 필터링)

### 피드백 수집 3계층
1. **암묵적 (자동):** 재질문, 코드 실행 여부, 응답 후 행동 자동 감지.
2. **명시적 (선택):** 👍👎 버튼. 세션 종료 시 1회 평가.
3. **자동 채점 (백그라운드):** Qwen3 4B가 응답 품질 자동 채점 → `auto_score`.

---

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

> ⚠️ 이 계약서는 백엔드와 프론트가 서로 상의 없이 독립 작업하기 위한 약속입니다.
> Claude Code는 이대로 만들고, Codex는 이대로 호출합니다. 임의로 변경 금지.
> 변경이 필요하면 반드시 Claude (웹)에게 먼저 알리고 이 문서 업데이트 후 작업.

#### Base URL
```
개발: http://localhost:8000
```

#### 공통 에러 응답 형식
```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "에러 설명"
}
```

#### 엔드포인트 목록

---

**POST /chat** — 대화 (SSE 스트리밍)

요청:
```json
{
  "message": "하나야 안녕",
  "conversation_id": "uuid-or-null"
}
```

응답 (Server-Sent Events):
```
data: {"type": "token", "content": "안"}
data: {"type": "token", "content": "녕"}
data: {"type": "token", "content": "!"}
data: {"type": "done", "message_id": "uuid", "conversation_id": "uuid", "mood": "HAPPY"}
data: [DONE]
```

에러 응답:
```
data: {"type": "error", "code": "LLM_UNAVAILABLE", "message": "Ollama 연결 실패"}
```

---

**GET /history** — 대화 히스토리 조회

요청:
```
GET /history?conversation_id=uuid&limit=50
```

응답:
```json
{
  "conversation_id": "uuid",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "하나야 안녕",
      "created_at": "2026-03-17T12:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "안녕!",
      "mood": "HAPPY",
      "created_at": "2026-03-17T12:00:01Z"
    }
  ]
}
```

---

**GET /conversations** — 세션 목록 조회

요청:
```
GET /conversations?limit=20
```

응답:
```json
{
  "conversations": [
    {
      "id": "uuid",
      "started_at": "2026-03-17T12:00:00Z",
      "session_summary": "FastAPI 구조 얘기함"
    }
  ]
}
```

---

**POST /feedback** — 피드백 전송

요청:
```json
{
  "message_id": "uuid",
  "score": 5
}
```

응답:
```json
{
  "success": true
}
```

---

**GET /mood** — 현재 무드 조회

응답:
```json
{
  "mood": "IDLE",
  "updated_at": "2026-03-17T12:00:00Z"
}
```

---

**GET /mood/stream** — 무드 변경 실시간 SSE 푸시

연결 유지. 무드 바뀔 때마다 push.
초기 연결 시 현재 무드 즉시 전송. 30초마다 heartbeat comment 전송.

이벤트 형식:
```
data: {"type": "mood_change", "mood": "MOOD_NAME", "updated_at": "ISO8601"}
data: {"type": "model_change", "model_id": "nanoka", "updated_at": "ISO8601"}
```

heartbeat:
```
: heartbeat
```

---

**GET /settings/models** — 캐릭터 모델 목록 조회

응답:
```json
{
  "models": [
    {
      "id": "nanoka",
      "path": "assets/character/nanoka/nanoka.model3.json",
      "name": "Nanoka"
    }
  ],
  "current": "nanoka"
}
```

---

**POST /settings/models/select** — 캐릭터 모델 변경

요청:
```json
{"model_id": "nanoka"}
```

응답:
```json
{"success": true, "current": "nanoka"}
```

---

**POST /voice/stt** — 음성 → 텍스트 (Phase 4.5)

요청: `multipart/form-data`
```
audio: <wav 파일>
```

응답:
```json
{
  "text": "하나야 오늘 뭐 할까",
  "confidence": 0.95
}
```

---

**POST /voice/tts** — 텍스트 → 음성 (Phase 4.5)

요청:
```json
{
  "text": "오늘 일정은 없어!",
  "mood": "HAPPY"
}
```

응답: `audio/wav` 바이너리 스트림

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

> ⚠️ **충돌 방지 규칙:** 각 에이전트는 자기 섹션(🔵 또는 🟡)만 수정합니다.
> 다른 에이전트 섹션은 읽기만 하고 절대 수정하지 않습니다.
> 오너 확인 필요 사항은 📋 섹션에 기록합니다.

---

### 📊 전체 Phase 진행 상태
```
Phase 1 (대화 AI 코어)     : ✅ 백엔드 완료, 프론트 진행 중
Phase 2 (기억)             : ✅ 백엔드 완료 (merged)
Phase 3 (화면 상주)        : 🔵 백엔드 진행 중 (mood stream + settings)
Phase 4 (MCP/도구)         : ⬜ 미시작
Phase 4.5 (음성)           : ⬜ 미시작
Phase 5 (파인튜닝)         : ⬜ 미시작
Phase 6 (마인크래프트)     : ⬜ 미시작
Phase 7 (빌드/패키징)      : ⬜ 미시작
```

---

### 🔵 Claude Code 상태 (백엔드 전담)
> 이 섹션은 Claude Code만 수정합니다.

```
현재 작업 브랜치: claude/phase3-mood-stream (커밋 완료, PR 대기 중)
현재 작업 중인 파일: 없음 (소유권 해제)
마지막 완료: Phase 3 백엔드 — mood stream + 무드 엔진 + 모델 설정 API (2026-03-18)
블로커: 없음
다음 작업: Phase 3 Codex 프론트 완료 후 dev 통합 검증 대기
```

**완료된 태스크 (Phase 1):**
- [x] FastAPI 서버 구조 (main.py, CORS, lifespan)
- [x] POST /chat SSE 스트리밍 엔드포인트
- [x] GET /history, GET /conversations
- [x] POST /feedback, GET /mood
- [x] SQLite DB 스키마 전체 6개 테이블 (AGENTS.md 6번)
- [x] Ollama qwen3:14b 연동 + 시스템 프롬프트 + 무드 엔진
- [x] Celery + Redis 뼈대 (celery_app.py)
- [x] docker-compose.test.yml + backend/Dockerfile.test
- [x] pytest 테스트: test_chat.py (9개), test_db.py (4개)
- [x] requirements.txt, .env.example

**완료된 태스크 (Phase 2):**
- [x] CLAUDE.md Logging 규칙 추가
- [x] DB 마이그레이션: messages 신규 컬럼 4개, voice_logs 테이블 신규
- [x] services/memory.py: mem0ai 연동, add_memory / search_memory / update_confidence
- [x] services/llm.py: memory_context 주입, 로깅 추가
- [x] routers/chat.py: 메모리 병렬 검색 + 기억 주입 + owner_response_delay_ms 저장
- [x] routers/memory.py: GET /memory/facts, DELETE /memory/facts/{id}
- [x] tasks/decay_tasks.py: 망각 곡선 confidence decay (매일 자정 beat)
- [x] tasks/memory_tasks.py: 세션 요약 Celery 태스크
- [x] celery_app.py: beat 스케줄 추가
- [x] pytest 테스트: test_memory.py 11개 신규 — 24/24 전부 통과
- [x] requirements.txt: mem0ai, chromadb 추가
- [x] pytest.ini: pythonpath 추가 (Docker 호환)

**완료된 태스크 (Phase 3 백엔드):**
- [x] .gitignore: assets/character/ 추가 (Live2D 저작권 보호)
- [x] services/mood.py: MOOD_TRIGGERS, asyncio.Queue 구독자 패턴, detect_mood_from_text, push_event
- [x] routers/mood.py: GET /mood/stream (SSE, 초기 무드 전송, 30초 heartbeat)
- [x] routers/settings.py: GET /settings/models, POST /settings/models/select
- [x] routers/chat.py: 응답 후 detect_mood_from_text + set_mood 자동 호출
- [x] main.py: mood_router, settings_router 등록
- [x] AGENTS.md 9-1 API 계약서 신규 엔드포인트 추가
- [x] backend/tests/test_mood_stream.py: 14개 테스트 — 38/38 전부 통과

**Codex에게 전달할 브리핑:**
- Phase 1/2 API 계약서 완전히 유지됨 — 기존 프론트 호출 방식 변경 없음
- Phase 3 신규 엔드포인트 (AGENTS.md 9-1 참고):
  - GET /mood/stream — SSE. 연결 즉시 현재 무드 push, 무드 바뀔 때마다 push, 30초 heartbeat
  - GET /settings/models — assets/character/ 스캔 결과 반환
  - POST /settings/models/select — 모델 선택 + /mood/stream으로 model_change 이벤트 push
- /mood (GET) 기존 엔드포인트 유지됨 — 초기 로드용으로 그대로 사용 가능
- mood stream 이벤트 타입: "mood_change" (무드 변경), "model_change" (모델 변경)
- mem0 실제 동작에는 ollama에 nomic-embed-text 모델 필요: ollama pull nomic-embed-text

---

### 🟡 Codex 상태 (프론트엔드 전담)
> 이 섹션은 Codex만 수정합니다.

```
현재 작업 브랜치: codex/phase3-overlay
현재 작업 중인 파일: 없음 (소유권 해제)
마지막 완료: Phase 3 오버레이 프런트엔드 구현 완료, 테스트/빌드 통과
블로커: backend `/settings/models`가 현재 `.model3.json`만 스캔해서 PMX 모델은 설정 목록에 노출되지 않음. 프런트는 PMX 렌더 경로를 구현했지만 백엔드 응답이 확장되어야 실제 전환 가능.
다음 작업: dev 기준 PR 준비. Claude Code는 PMX 모델 스캔 계약 필요 여부 확인.
```

**완료된 태스크:**
- [x] frontend 기본 구조 구성 (electron/, src/, tests/, styles/)
- [x] Electron main 프로세스 기본 창 설정 + 개발 시 localhost:3000 로드
- [x] ChatWindow 구현 (입력/전송/히스토리 렌더)
- [x] POST /chat 호출 + SSE 스트리밍 파싱
- [x] SSE 이벤트 처리: token/done/error/[DONE]
- [x] VITE_API_BASE_URL 환경변수 연결 (.env 기본값 포함)
- [x] App 라우팅 + Alt+H 채팅 오버레이 토글
- [x] Jest/RTL 테스트 추가 (ChatWindow, CharacterOverlay, Hotkey)
- [x] 프론트 로컬 실행 확인됨 / 백엔드 연동 확인
- [x] 로컬 테스트 통과: `npm test` (frontend)
- [x] Electron 이중 오버레이 창 + 설정 창 분리, 트레이 메뉴/Alt+H 토글 구현
- [x] `useMoodStream` 추가: `/mood/stream` 구독, 5회 실패 시 `/mood` polling fallback
- [x] CharacterOverlay 확장: Live2D/PMX 타입 감지, placeholder fallback, 말풍선 표시
- [x] Chat overlay UI 업그레이드: 반투명 패널, mood indicator, assistant feedback 버튼
- [x] Settings UI 구현: `/settings/models` 목록 렌더, 타입 배지, `/settings/models/select` 호출
- [x] 프런트 전용 Docker 테스트 파일 추가: `frontend/docker-compose.frontend.yml`, `frontend/Dockerfile.test`
- [x] Phase 3 테스트 추가 및 통과: `npm test` (12/12)
- [x] Vite build 통과: `npm run build`

**Claude Code에게 전달할 브리핑:**
- Docker 테스트 명령(`docker-compose -f docker-compose.test.yml run frontend npm test`)은 현재 compose 파싱 오류로 실패:
  - `services.backend.environment.[0]: unexpected type map[string]interface {}`
  - 프론트 자체 Jest 테스트는 로컬에서 통과 완료
- mood stream fallback은 런타임에서 강제 발생시키지 않았고 Jest로만 검증함
- `npm run electron:dev`는 권한 상승 후 실행 시작은 됐지만 GUI 장기 실행이라 Codex 셸에서 타임아웃됨. 수동 UI 확인은 오너 환경에서 최종 체크 필요
- backend `backend/routers/settings.py` 기준 현재 모델 스캔이 Live2D 전용이라 PMX 선택 UI가 실제로 채워지지 않을 수 있음

---

### 📋 오너 확인 필요
> 결정이 필요하거나 에이전트가 막힌 경우 여기에 기록합니다.

- 없음

---

### ✅ 기획 완료 항목 (변경 없음)
- [x] 프로젝트 기획 확정
- [x] 전체 아키텍처 설계
- [x] DB 스키마 확정
- [x] 기술 스택 확정
- [x] AGENTS.md 최종 작성
- [x] CLAUDE.md 작성
- [x] CODEX.md 작성
- [x] GitHub 레포 생성

---

### ⬇️ 다음 지시사항 — Phase 1 시작

**오너가 먼저 할 것:**
1. 이 `AGENTS.md`, `CLAUDE.md`, `CODEX.md` 파일을 레포 루트에 커밋
2. `dev` 브랜치 생성
3. 환경 준비:
   - Python 3.11 + venv 세팅
   - Node.js 설치 확인
   - Ollama 설치 + `ollama pull qwen3:14b` 실행
   - Redis 설치 + `redis-server` 실행 확인
   - **Docker Desktop 설치** (https://www.docker.com/products/docker-desktop)
     → 테스트 환경 격리에 사용. 설치 후 실행 중인지 확인.

> 💡 **Docker가 필요한 이유:** FastAPI 테스트는 Redis, SQLite 등 여러 서비스가 동시에 필요합니다.
> Docker가 이 환경을 자동으로 맞춰주므로 "내 PC에선 되는데 왜 안 돼?" 문제가 없어집니다.
> Ollama(LLM)는 너무 크므로 테스트에서는 mock으로 대체합니다.

---

#### 🔵 Claude Code에게 전달할 프롬프트 (백엔드)

```
[HANA Project - Phase 1 백엔드 구현]

시작 전 AGENTS.md 파일 전체를 반드시 읽어주세요.
이 문서가 모든 설계의 기준입니다.

당신은 백엔드 전담입니다.
frontend/ 디렉토리는 절대 건드리지 마세요.

브랜치: claude/phase1-backend

== 완료 기준 ==
"하나야 안녕" POST /chat 요청 시
SSE 스트리밍으로 응답이 오고 DB에 저장됨.

== 구현할 것 ==

1. backend/ 디렉토리 구조 생성 (AGENTS.md 5-3 참고)

2. FastAPI 서버 (backend/main.py)
   - CORS 설정: origins=["http://localhost:3000"]
   - uvicorn 실행 포트: 8000

3. API 엔드포인트 — AGENTS.md 9-1 계약서 그대로 구현
   - POST /chat (SSE 스트리밍)
     응답 형식: {"type":"token","content":"..."} 토큰 단위
     완료 시:  {"type":"done","message_id":"uuid","conversation_id":"uuid","mood":"IDLE"}
   - GET /history
   - GET /conversations
   - POST /feedback
   - GET /mood

4. SQLite DB (backend/models/schema.py)
   - AGENTS.md 6번 스키마 전체 구현
   - 앱 시작 시 자동 생성

5. Ollama 연동 (backend/services/llm.py)
   - 모델: qwen3:14b
   - OLLAMA_KEEP_ALIVE=-1 설정
   - SSE 스트리밍 구현

6. 하나 시스템 프롬프트 (AGENTS.md 2번 성격 설정 기반)
   - 기본 무드: IDLE

7. Celery + Redis 기본 구조만 (backend/celery_app.py)
   - Phase 2에서 태스크 추가 예정. 지금은 뼈대만.

8. .gitignore (data/, venv/, __pycache__/, .env)

9. requirements.txt

10. docker-compose.test.yml — 테스트 환경 정의
    - backend 서비스 (FastAPI)
    - redis 서비스
    - SQLite는 인메모리 테스트 DB 사용
    - Ollama는 mock으로 대체 (실제 LLM 호출 없음)
    - 실행: docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit

11. backend/tests/ 기본 테스트 작성
    - test_chat.py: /chat 엔드포인트 happy path + error case
    - test_db.py: 테이블 자동 생성 확인
    - Ollama는 pytest mock으로 대체

== 완료 후 ==
AGENTS.md [10. 현재 상태] 업데이트:
- 완료 태스크 체크
- "백엔드 API 로컬 실행 확인됨 / 포트 8000" 브리핑 추가
- 파일 소유권 해제
dev 브랜치로 PR
```

---

#### 🟡 Codex에게 전달할 프롬프트 (프론트엔드)

```
[HANA Project - Phase 1 프론트엔드 구현]

시작 전 AGENTS.md 파일 전체를 반드시 읽어주세요.
이 문서가 모든 설계의 기준입니다.

당신은 프론트엔드 전담입니다.
backend/ 디렉토리는 절대 건드리지 마세요.

브랜치: codex/phase1-frontend

== 완료 기준 ==
채팅창에 메시지 입력 시
백엔드 POST /chat 호출 → SSE 스트리밍으로 하나 응답이
글자 단위로 화면에 표시됨.

== 백엔드 API 주소 ==
환경변수 VITE_API_BASE_URL 사용 (기본값: http://localhost:8000)
직접 하드코딩 금지. .env 파일에 VITE_API_BASE_URL=http://localhost:8000 설정.
(AGENTS.md 9-1 계약서 참고 — 이 스펙대로 호출할 것)

⚠️ /voice/stt, /voice/tts 엔드포인트는 Phase 4.5 대상. Phase 1에서 구현 불필요.

== 구현할 것 ==

1. frontend/ 디렉토리 구조 생성 (AGENTS.md 5-3 참고)

2. Electron 메인 프로세스 (frontend/electron/main.js)
   - BrowserWindow 기본 설정
   - 개발 시 localhost:3000 로드

3. React 기본 채팅 UI (frontend/src/)
   - ChatWindow.jsx
     - 메시지 입력창 + 전송 버튼
     - POST /chat 호출 (SSE 스트리밍)
     - 토큰 단위로 글자 순차 표시
     - 대화 히스토리 표시
   - App.jsx (라우팅)

4. SSE 스트리밍 파싱
   - type: "token" → 글자 이어붙이기
   - type: "done"  → 완료 처리
   - type: "error" → 에러 메시지 표시

5. package.json (Electron + React 설정)

== 완료 후 ==
AGENTS.md [10. 현재 상태] 업데이트:
- 완료 태스크 체크
- "프론트 로컬 실행 확인됨 / 백엔드 연동 확인" 브리핑 추가
- 파일 소유권 해제
dev 브랜치로 PR
```

---

> ⚠️ **두 작업은 병렬로 진행 가능합니다.**
> Claude Code는 백엔드 완성 후 `claude/phase1-backend → dev` PR.
> Codex는 프론트 완성 후 `codex/phase1-frontend → dev` PR.
> 오너가 dev에서 둘 합쳐서 테스트 후 main PR.

---

*최종 업데이트: 빌드 & 패키징 전략 추가 (Phase 7, electron-builder, PyInstaller, 자동 실행)*
*다음 업데이트 예정: Phase 1 구현 완료 시*
