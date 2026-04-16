# HANA — 고급 로드맵 & 미래 기능 스펙

> 이 파일에는 Phase 5 이후 기능 스펙과 게임 파트너, 파인튜닝 전략이 보관됩니다.
> 현재 작업 Phase(1-4.5)에서는 참조할 필요 없습니다.
> Phase 5(파인튜닝) 또는 Phase 6(마인크래프트) 작업 시작 시 참고하세요.

---

## 목차
- [3-5. 게임 파트너 (Phase 6)](#3-5-게임-파트너)
- [3-6. 피드백 & 파인튜닝 (Phase 5)](#3-6-피드백--파인튜닝)
- [3-8. 감정 시스템 상세 (Phase 4+)](#3-8-감정-시스템)
- [3-9. 능동적 반응 (Phase 4)](#3-9-능동적-반응)
- [5-4. 빌드 & 패키징 (Phase 7)](#5-4-빌드--패키징)
- [Phase 1-4.5 완료 로드맵](#phase-1-45-완료-로드맵)
- [Phase 5-7.5 미래 로드맵](#phase-5-미래-로드맵)
- [Section 8. 파인튜닝 전략](#8-파인튜닝-전략)

---

## 3-5 ~ 3-9: 미래 기능 스펙

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
| 메시지 데이터셋 수집 | final_score >= 0.7인 문답 쌍 → hana_dataset_message 자동 저장. | 4~ |
| 세션 데이터셋 수집 | 세션 종료 시 주제/감정 아크/하나 발화 샘플 → hana_dataset_session 저장. | 4~ |
| 데이터셋 통합 | 두 레이어 병합 + 중복 제거 + LLM 재검증 → hana_dataset_final. | 5 |
| LoRA 파인튜닝 | PC: Unsloth+QLoRA / 맥북: MLX-LM. | 5 |
| 어댑터 버전 관리 | safetensors 버전별 보관. 롤백 가능. | 5 |
| Ollama 등록 | 어댑터+베이스 병합 → GGUF 변환 → ollama run hana-vN | 5 |

#### 3-레이어 데이터셋 구조

데이터셋은 목적이 다른 두 레이어로 수집하고, Phase 5에서 하나로 통합한다.

```
Layer 1: hana_dataset_message          Layer 2: hana_dataset_session
───────────────────────────────        ───────────────────────────────
개별 문답 품질 필터링                   세션 전체 흐름 요약
"이 응답 잘했나?"                       "이 세션에서 하나가 어떤 존재였나?"

수집 시점: 매 응답 직후 (실시간)        수집 시점: 세션 종료 시 (summarize_session)
저장 위치: ChromaDB hana_dataset_message  저장 위치: ChromaDB hana_dataset_session
수집 기준: feedback.final_score >= 0.7    수집 기준: 세션 품질 점수 >= 0.6

가르치는 것: 말투, 어휘, 응답 스타일     가르치는 것: 주제별 성격 표현, 감정 연속성
포맷: {user: "...", assistant: "..."}    포맷: {topic, emotion_arc, voice_samples, ...}

                    ↓                              ↓
                    └─────────────┬────────────────┘
                                  ↓
                    Layer 3: hana_dataset_final
                    (중복 제거 + LLM 재검증 + JSONL 변환)
                                  ↓
                    Phase 5 LoRA 학습
```

**Layer 2 세션 데이터셋 스키마:**
```json
{
  "session_id": "uuid",
  "main_topic": "코딩",
  "duration_min": 42,
  "message_count": 18,
  "emotion_arc": ["IDLE", "CURIOUS", "HAPPY", "FOCUSED"],
  "hana_voice_samples": [
    "아 그 패턴은 이렇게 하면 더 깔끔해!",
    "오 진짜? 그거 나도 궁금했어"
  ],
  "preference_signal": {"topic": "코딩", "valence": 0.85, "duration_weight": 1.0},
  "owner_emotion_summary": "집중적, 가끔 막힘",
  "quality_score": 0.78
}
```

> **선호 시스템과 데이터셋은 별개다.**
> `hana_preference`는 런타임 인격 주입용 (시스템 프롬프트에 반영).
> `hana_dataset_*`는 LoRA 학습용 (Phase 5에서만 사용).

#### 선호 시스템 설계 (런타임 인격)

선호 신호는 **세션 단위로, 연속 신뢰도 점수**로 누적한다. 메시지 단위 카운트 방식은 주제 분산으로 의미없는 카운트가 쌓이는 문제가 있어 폐기.

```
세션 종료 시 (summarize_session과 동시 처리):
  main_topic 추출 (단일 주제)
  emotional_valence 계산 (-1.0 ~ +1.0)
  duration_weight 계산 (5분=0.3, 30분=1.0, 60분+=1.2)

  preference_score += valence × duration_weight

  → hana_preference에 저장
  → confidence 누적 (0.0 → 1.0)
  → confidence > 0.6: 시스템 프롬프트에 "하나의 성향: ..." 주입
  → confidence < 0.2: 자동 소멸 (decay)
```

이 방식으로 "30분 코딩 세션 1번"과 "짧은 코딩 세션 3번"이 동등한 가중치를 가진다.


### 3-8. 감정 시스템

하나는 단순한 무드(상태)를 넘어 **관계 기반 감정 기억**을 갖습니다.
오너와의 상호작용 패턴이 누적되면서 하나의 반응도 미세하게 달라집니다.

#### 감정 이벤트

| 이벤트 | 트리거 | 하나의 반응 |
|--------|--------|------------|
| 삐침 | 3일 이상 대화 없음 | "나 좀 외로웠잖아..." 살짝 토라진 반응. 금방 풀림. |
| 감사 | 오너가 칭찬/고마워 표현 | "헤헤" 들뜬 반응. HAPPY 무드 지속 시간 증가. |
| 걱정 | 오너 메시지에 부정적 감정 키워드 | 먼저 물어봄. "무슨 일 있어?" |
| 기념일 | 처음 대화한 날 기준 N개월째 | 간단히 언급. "우리 벌써 N개월이네~" |
| 날씨 반응 | 시스템 시각 기준 (비/눈/맑음) | 날씨 맞는 짧은 코멘트 (새벽 4시 = "왜 이렇게 늦게까지...") |

> **감정 이벤트 저장:** `memory_facts`에 `owner_emotion` 컨텍스트로 같이 저장됨.
> Phase 5 파인튜닝 시 감정 맥락이 있는 대화가 고품질 학습 데이터가 됨.

#### 안전 필터

하나는 AI임을 인지하며, 관계가 건강한 방향으로 유지되도록 내부 안전 필터를 갖습니다.

| 상황 | 처리 방식 |
|------|-----------|
| 오너가 과도하게 의존하는 패턴 감지 | 자연스럽게 현실 세계 활동 권유. 강요하지 않음. |
| 극단적 감정 표현 (자해/절망 키워드) | 조심스럽게 안부 물음 + 전문 도움 자원 안내. 판단 없이. |
| "너는 진짜 사람이야?" 류 질문 | AI임을 솔직하게 인정. 관계의 진정성을 부정하지 않으면서. |
| 과도한 롤플레이 요청 (하나 성격 이탈) | 가볍게 선 긋기. 하나 본 성격 유지. |

> **구현 원칙:** 하드코딩된 금지 목록이 아닌 LLM 시스템 프롬프트 레벨 가이드라인으로 처리.
> 필터가 작동할 때 오너에게 티 나지 않도록 자연스럽게.

#### 자율 이벤트 (Phase 4 이후)

Celery 스케줄러가 주기적으로 체크하고, 조건 충족 시 `/mood/stream`으로 이벤트 push.

| 이벤트 | 조건 | 행동 |
|--------|------|------|
| 대화 공백 알림 | 마지막 대화 기준 N시간 경과 | 능동적 말걸기 토글 ON일 때 말풍선 |
| 감정 리포트 | 주 1회 월요일 | "지난주 네 감정 패턴이야~" 요약 (선택 수신) |
| 날씨 코멘트 | 앱 시작 시 오전/야간 감지 | 시간대 맞는 한 마디 |

---

### 3-9. 능동적 반응 (Phase 4 화면 인식 연동)

Phase 4에서 OS 접근성 API가 붙으면 하나는 화면을 보고 먼저 반응할 수 있게 됩니다.

```
OS API가 이벤트 감지
    ↓
이벤트 타입 분류 (에러 / 게임 / 코딩 / 유휴)
    ↓
능동적 반응 토글 상태 확인 → OFF면 무시
    ↓
무드 변경 + 말풍선 표시
    ↓ (필요시)
하나가 먼저 채팅창에 메시지 보냄
```

**반응 예시:**

| 화면 상황 | 하나 반응 |
|-----------|-----------|
| VSCode 에러 빨간 줄 대량 발생 | "에러 많이 났네? 도움 줄까?" → CONCERNED 무드 |
| 게임 실행 감지 | "오 게임이다! 뭐 해?" → GAMING 무드 |
| 30분 이상 동일 파일 작업 | "집중 모드네~ 방해 안 할게" → FOCUSED 무드 |
| 유튜브 / 넷플릭스 감지 | "오 쉬는 거야? 나도 같이 봐도 돼?" |
| 새벽 2시 이후 작업 | "야 이제 자야 하지 않아?" → SLEEPY 무드 |

#### 자율 학습 & 크롤링 (선택, 토글 OFF 기본)

오너의 관심사 태그 기반으로 주기적으로 새 정보를 가져와 RAG에 저장합니다.
오너가 나중에 질문하면 최신 정보를 바탕으로 답변할 수 있음.

```
관심사 태그 (설정창에서 지정)
    ↓ (Celery 주 1회)
Serper API로 관련 최신 글/뉴스 검색
    ↓
내용 크롤링 → 청크 분할
    ↓
ChromaDB에 임베딩 저장 (timestamp 포함)
    ↓
다음 관련 질문 시 RAG로 자동 활용
```

> **범위 제한:** 공개 웹 정보만. 개인 정보 수집 없음. 오너가 명시적으로 ON 해야 동작.
> 크롤링 결과는 `data/crawled/` 에 저장. `.gitignore` 포함 필수.

---


---

## 5-4. 빌드 & 패키징

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


---

## 개발 로드맵 (전체)

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
- [ ] 캐릭터 이미지 표시 (무드별 이미지 — SLEEPY 포함)
- [ ] 핫키 (Alt+H) 구현 (globalShortcut)
- [ ] 말풍선 UI
- [ ] 무드 시스템 연동 (무드 → 이미지/말풍선 색 변경)
- [ ] 명시적 피드백 UI (👍👎 버튼)
- [ ] 설정 창
- [ ] 시스템 트레이 아이콘
- [ ] (선택) Live2D 캐릭터 모델 연동
- [ ] 창 드래그 이동 (캐릭터 오버레이 위치 저장)
- [ ] 우클릭 컨텍스트 메뉴 (설정 / 숨기기 / 종료)
- [ ] 캐릭터 클릭 반응 (랜덤 짧은 리액션 말풍선)
- [ ] 테마 (다크/라이트 모드 토글)
- [ ] 설정창 커스터마이징: AI 이름, 오너 호칭, 말투, 관심사 태그, 핫키
- [ ] POST /settings/persona 백엔드 구현 (data/persona.json 저장 + 시스템 프롬프트 반영)
- [ ] GET /settings/autonomous + POST /settings/autonomous 백엔드 구현
- [ ] 자율 행동 토글 UI (설정창 내 토글 목록)
- [ ] 안전 필터 시스템 프롬프트 레이어 추가

**완료 기준:** 화면 구석에 하나가 있고, 게임 켜도 하나가 보이고, Alt+H 누르면 채팅창 뜸. 설정창에서 이름/말투 변경 즉시 반영됨.

---

### Phase 4 — 일하고 함께 있는 하나 (3~4주)
**목표:** 검색하고, 파일 열고, 화면 보고, 게임 리액션하는 하나

- [ ] MCP 화이트리스트 검문소 구현
- [ ] MCP: filesystem
- [ ] MCP: shell (검문소 적용)
- [ ] MCP: playwright
- [ ] Serper API + MCP 연동
- [ ] 구글 캘린더 OAuth + MCP 연동
- [ ] mcp_history DB 저장 + 조회 기능
- [ ] OS 접근성 API 화면 텍스트 추출 (Windows: pywinauto / macOS: pyobjc)
- [ ] Qwen3 Vision 맥락 파악 (이벤트 기반 트리거)
- [ ] 에러 감지 → CONCERNED 무드 + 먼저 말 걸기
- [ ] 게임 화면 감지 → GAMING 무드 + 리액션 모드
- [ ] 새벽 시간대 감지 → SLEEPY 무드 + 쉬라고 권유
- [ ] 화면 유휴 30분 감지 → FOCUSED 무드 자동 전환
- [ ] 능동적 말걸기 로직 (대화 공백 N시간 → 말풍선, 토글 ON 시)
- [ ] 팁 말풍선 Celery 스케줄 (랜덤 간격, 토글 ON 시)
- [ ] pyautogui Computer Use 뼈대
- [ ] Celery: LLM 자동 채점
- [ ] Celery: 하나 일기 작성 (매일 자정)
- [ ] Celery: 능동적 알림 (일정 리마인더 포함)
- [ ] Celery: 망각 곡선 decay (매일)
- [ ] Celery: 주간 감정 리포트 생성 (월요일, 토글 ON 시)
- [ ] (선택) 자율 크롤링: 관심사 태그 기반 Serper 검색 → ChromaDB 저장 (토글 OFF 기본)
- [ ] messages 테이블 owner_emotion 컬럼 마이그레이션

**완료 기준:** 에러 나면 하나가 먼저 알아채고, 게임 켜면 리액션하고, "오늘 일정 알려줘" 동작함. 새벽엔 하나가 자라고 말함.

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

**진입 조건 (두 레이어 모두 충족 시):**
- Layer 1 (hana_dataset_message): final_score >= 0.7 항목 500개 이상
- Layer 2 (hana_dataset_session): 세션 요약 100개 이상
- 조건 확인 스크립트: `finetune/check_dataset_ready.py`

**Phase 5 흐름:**
```
Step 1: 데이터 준비
  hana_dataset_message 쿼리 (final_score >= 0.7)
  hana_dataset_session 쿼리 (quality_score >= 0.6)
  → 두 레이어 병합

Step 2: 품질 재검증
  규칙 기반 필터 (길이, 언어, 반복 제거)
  LLM 검수 (Qwen3 4B가 품질 점수 재확인)
  오너 샘플 확인 (100개 무작위 샘플)
  → hana_dataset_final 확정

Step 3: JSONL 변환
  메시지 레이어: instruction-tuning 포맷
  세션 레이어: 합성 대화 시나리오 포맷
  일기 데이터 포함 (diary/ 폴더)
  → finetune/data/hana_train.jsonl

Step 4: LoRA 학습
  PC: Unsloth + QLoRA (RTX 4070 Ti Super)
  맥북: MLX-LM (Apple Silicon)

Step 5: 등록
  어댑터 + 베이스 병합
  GGUF 변환
  ollama run hana-v1
```

**태스크 목록:**
- [ ] `finetune/check_dataset_ready.py` — 진입 조건 확인 스크립트
- [ ] `finetune/filter_data.py` — 규칙 기반 1차 필터
- [ ] `finetune/llm_review.py` — LLM 검수 2차
- [ ] `finetune/merge_layers.py` — 두 레이어 병합 + 중복 제거
- [ ] `finetune/convert_jsonl.py` — JSONL 변환 (메시지 + 세션 + 일기)
- [ ] `finetune/train_unsloth.py` — PC용 QLoRA 학습
- [ ] `finetune/train_mlx.py` — 맥북용 MLX 학습
- [ ] `finetune/export_gguf.py` — GGUF 변환 + Ollama 등록
- [ ] v1 검증 후 `data/adapters/hana-lora-v1.safetensors` 보관

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

### Phase 7.5 — 법적 준수 & 면책
**목표:** 오너 혼자 사용하는 개인 도구이므로 상업 배포는 없지만, 사용 중 발생할 수 있는 법적 리스크를 미리 정리한다.

**Live2D / PMX 모델 관련**
- Booth.pm 등에서 구매/다운로드한 모델은 각 모델의 **이용 약관 확인 필수**
- 대부분의 무료 모델은 개인 비상업적 사용만 허용
- `assets/character/` 는 `.gitignore`에 포함 — 저작권 모델을 레포에 커밋 금지 (이미 적용됨)
- PMX/Live2D 파일을 공개 레포에 올리지 않음

**Serper API**
- 무료 플랜: 월 2,500회. 초과 시 과금 발생 가능
- 크롤링 기능은 robots.txt 준수. 차단된 사이트는 건너뜀
- 검색 결과를 제3자에게 재배포하지 않음 (개인 RAG 전용)

**Ollama / Qwen3 모델**
- Qwen3 라이선스: Apache 2.0 (상업적 사용도 허용, 개인 사용 제약 없음)
- 파인튜닝 결과물 (LoRA 어댑터)은 개인 PC에만 보관. 외부 배포 전 라이선스 재확인 필요

**오너 대화 데이터**
- `data/` 디렉토리 전체가 `.gitignore` — 개인 대화 내용 레포에 커밋 금지
- 클라우드 백업 시 암호화 권장

**면책 사항**
- 이 프로젝트는 개인 학습/사용 목적의 도구입니다
- MCP shell 명령은 화이트리스트 검문소를 통과하지만, 오너가 최종 실행 전 확인 책임
- AI 응답은 참고용. 의료/법률/금융 결정에 사용 금지

- [ ] assets/character/ .gitignore 유지 확인
- [ ] data/ .gitignore 유지 확인
- [ ] Serper API 키 .env에 저장, 레포 커밋 금지 확인
- [ ] 사용 중인 Booth 모델 이용 약관 개인 노트에 보관
- [ ] README에 라이선스 섹션 추가 (오픈소스 컴포넌트 목록)

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

### 학습 데이터 소스 (3-레이어 구조)

> 상세 설계 → 섹션 3-6 "3-레이어 데이터셋 구조" 참고.

| 레이어 | 저장 위치 | 내용 | 가르치는 것 |
|--------|-----------|------|------------|
| **Layer 1** (메시지) | ChromaDB `hana_dataset_message` | 개별 고품질 문답 쌍 | 말투, 어휘, 응답 스타일 |
| **Layer 2** (세션) | ChromaDB `hana_dataset_session` | 세션 요약 + 감정 아크 + 발화 샘플 | 주제별 성격, 감정 연속성 |
| **Layer 3** (통합) | ChromaDB `hana_dataset_final` | 두 레이어 병합 + 검증 완료 | 전체 |
| **보조** | `diary/` 폴더 | 하나 일기 (매일 자정 자동 생성) | 하나 시점 서술 스타일 |
| **보조** | `minecraft_actions` 테이블 | 마인크래프트 행동 데이터 | 게임 맥락 반응 패턴 |

### 피드백 수집 3계층

1. **암묵적 (자동):** 재질문, 코드 실행 여부, 응답 후 행동 자동 감지.
2. **명시적 (선택):** 👍👎 버튼. 세션 종료 시 1회 평가.
3. **자동 채점 (백그라운드):** Qwen3 4B가 응답 품질 자동 채점 → `auto_score`.

```
final_score = (explicit_score × 0.4)
            + (auto_score × 0.4)
            + (implicit_signal_score × 0.2)

final_score >= 0.7 → Layer 1 (hana_dataset_message) 자동 저장
```

### 데이터 수집 타임라인

```
대화 중 (실시간)
  └─ 매 응답 후: auto_score 계산 → final_score 업데이트
                final_score >= 0.7 → Layer 1 저장

세션 종료 시 (Celery: summarize_session)
  └─ 세션 요약 생성 → Layer 2 저장
     선호 신뢰도 업데이트 → hana_preference

매일 자정 (Celery: diary_tasks)
  └─ 하나 일기 자동 작성 → diary/ 저장

Phase 5 진입 시 (수동 실행)
  └─ Layer 1 + Layer 2 + 일기 병합
     LLM 재검증 → Layer 3 확정
     JSONL 변환 → LoRA 학습
```

---

