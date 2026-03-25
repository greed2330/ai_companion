# HANA — 현재 상태 & 작업 브리핑

> ⚠️ **이 파일은 에이전트 간 유일한 소통 채널입니다.**
> 작업 전 반드시 읽고, 작업 후 반드시 업데이트하세요.
> 이 파일은 AGENTS.md 섹션 10에서 분리되었습니다. (2026-03-24)
>
> **충돌 방지 규칙:** 각 에이전트는 자기 섹션(🔵 또는 🟡)만 수정합니다.
> 다른 에이전트 섹션은 읽기만 하고 절대 수정하지 않습니다.
> 오너 확인 필요 사항은 📋 섹션에 기록합니다.

---

## 📊 전체 Phase 진행 상태
```
Phase 1 (대화 AI 코어)     : ✅ 백엔드 완료, 프론트 완료
Phase 2 (기억)             : ✅ 백엔드 완료 (merged)
Phase 3 (화면 상주)        : 🔵 백엔드 완료 (PR 대기), 프론트 완료 (PR 대기) — dev 통합 검증 대기
Phase 4 (MCP/도구)         : ⬜ 미시작
Phase 4.5 (음성)           : ⬜ 미시작
Phase 5 (파인튜닝)         : ⬜ 미시작
Phase 6 (마인크래프트)     : ⬜ 미시작
Phase 7 (빌드/패키징)      : ⬜ 미시작
Phase 7.5 (법적 준수)      : ⬜ 항목 정리 완료, 실행 미시작
```

---

## 🔵 Claude Code 상태 (백엔드 전담)
> 이 섹션은 Claude Code만 수정합니다.

```
현재 작업 브랜치: claude/phase3-llm-router (커밋 완료, PR 대기)
현재 작업 중인 파일: 없음 (소유권 해제)
마지막 완료: LLM Router + Dual-Call Pipeline + Session Judge + Reaction Engine (2026-03-24)
블로커: 없음
다음 작업: dev 머지 후 다음 PROMPT 작업 대기
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
- [x] API_CONTRACT.md: 신규 엔드포인트 추가
- [x] backend/tests/test_mood_stream.py: 14개 테스트 — 38/38 전부 통과

**완료된 태스크 (Phase 3 follow-up):**
- [x] services/settings_service.py: in-memory 공유 상태 + settings.json I/O (get/set_current_chat_model)
- [x] routers/settings.py: PMX 스캔 추가 (type 필드), GET /settings/llm/models, POST /settings/llm/select
- [x] services/llm.py: OLLAMA_MODEL 상수 제거, settings_service.get_current_chat_model() 연동
- [x] main.py: lifespan에서 data/ 디렉토리 자동 생성
- [x] .env.example: OLLAMA_WORKER_MODEL, OLLAMA_VISION_MODEL 추가
- [x] API_CONTRACT.md: /settings/models type 필드, LLM 엔드포인트 2개 추가
- [x] backend/tests/test_settings_extended.py: 7개 테스트 — 45/45 전부 통과

**완료된 태스크 (Phase 3 버그픽스):**
- [x] services/llm.py: `"think": False` 추가 — qwen3 시리즈 400 에러 수정
- [x] services/llm.py: DEBUG 레벨 payload 로그 추가
- [x] routers/mood.py: SSE 헤더 추가 — `Cache-Control: no-cache`, `X-Accel-Buffering: no`
- [x] routers/settings.py: rglob 결과 sorted() 정렬 — deterministic 파일 선택
- [x] tests/test_chat.py: Ollama payload think:false 검증, 모델 선택 반영 검증 (2개 추가)
- [x] tests/test_settings_extended.py: CJK 파일명 + 공백 경로 케이스 추가
- [x] tests/test_mood_stream.py: SSE 헤더 + 이벤트 shape 검증 (2개 추가) — 51/51 전부 통과

**완료된 태스크 (Phase 4 능동 알림 주기 제어):**
- [x] backend/models/schema.py: proactive_log 테이블 추가
- [x] backend/services/proactive_service.py: can_trigger / log_trigger / mark_ignored 구현
- [x] backend/routers/proactive.py: POST /proactive/check, POST /proactive/ignored, GET /proactive/status
- [x] backend/main.py: proactive_router 등록
- [x] AGENTS.md 3-7: 능동 알림 주기 규칙 테이블 추가
- [x] API_CONTRACT.md: /proactive/check, /proactive/ignored, /proactive/status 계약 추가
- [x] backend/tests/test_proactive.py: 17개 테스트 — 68/68 전부 통과

**완료된 태스크 (Phase 3 think/prompt/voice/sulky):**
- [x] services/llm.py: 시스템 프롬프트 재작성 — 자연어 말투, 금지 문구 명시, Good/Bad 예시
- [x] services/llm.py: `should_use_think()` — interaction_type + 키워드 기반 동적 think 모드
- [x] services/llm.py: `postprocess_for_voice()` — 이모지/마크다운 제거, 50자 이내 단문화
- [x] services/llm.py: `build_system_prompt()` — mood/persona/voice_mode/sulky/memories 전부 반영
- [x] services/llm.py: `complete_chat()` — 페르소나 프리뷰용 단발 호출 헬퍼
- [x] services/llm.py: `stream_chat()` — think=True 스트림 파서 (thinking 청크 DEBUG 로그)
- [x] services/sulky_service.py: 삐짐 인메모리 상태 + RECONCILE_KEYWORDS 화해 감지
- [x] services/room_service.py: `detect_room_type()` — 키워드 기반 coding/game/general 분류
- [x] services/settings_service.py: `get_persona()` / `set_persona()` + settings.json 통합 관리
- [x] services/proactive_service.py: `can_trigger()`에 sulky 체크 추가 (SULKY_EXCEPTIONS 존중)
- [x] routers/settings.py: GET/POST `/settings/persona`, POST `/settings/persona/preview`
- [x] routers/chat.py: `interaction_type` + `voice_mode` 필드, 룸 감지 + room_change SSE, 삐짐 화해 처리
- [x] API_CONTRACT.md: POST /chat 신규 필드(interaction_type, voice_mode) + room_change 이벤트 추가
- [x] backend/tests/test_think_voice_sulky_room.py: 33개 테스트 — 101/101 전부 통과

**완료된 태스크 (docs 정리):**
- [x] API_CONTRACT.md 신규 분리 (AGENTS.md 9-1에서 이동)
- [x] STATUS.md 신규 분리 (AGENTS.md 섹션 10에서 이동)
- [x] CLAUDE.md, CODEX.md 레퍼런스 업데이트

**완료된 태스크 (PROMPT_04-6B: LLM Router + Dual-Call Pipeline):**
- [x] backend/models/emotion.py: EMOTION_TO_MOOD 매핑
- [x] backend/services/llm_router.py: LLMRouter (ollama/openai/anthropic/protocol/custom), stream/call_for_json
- [x] backend/services/session_judge.py: SessionContext, judge_session_start, save_session_end
- [x] backend/services/safety_filter.py: should_block, get_block_response
- [x] backend/services/response_parser.py: ParsedResponse, parse_response (규칙 기반)
- [x] backend/services/internal_prompt_builder.py: build_internal_state_prompt
- [x] backend/services/tts_emotion.py: get_tts_params (강도 보간)
- [x] backend/services/reaction_engine.py: 3-tier 필터, ReactionEngine.judge
- [x] backend/services/model_context_service.py: on_model_changed, get_model_llm_context
- [x] backend/services/model_scheduler.py: is_apple_silicon, prepare/restore stub
- [x] backend/services/context_builder.py: build_context (메모리 + 상황 주입)
- [x] backend/services/chat_pipeline.py: 듀얼콜 파이프라인 (스트리밍 1st + 백그라운드 2nd)
- [x] backend/services/llm.py: get_ollama_base_url() 추가
- [x] backend/routers/chat.py: thin wrapper, feedback score 검증
- [x] backend/routers/settings.py: GET/POST /settings/llm, /test, /protocol/*, /current-context
- [x] backend/main.py: load_cached_context() lifespan 등록
- [x] backend/models/schema.py: owner_emotion 컬럼 추가 (CREATE + migration)
- [x] backend/tests/test_llm_router_and_pipeline.py: 36개 테스트
- [x] 기존 테스트 6개 파일 패치 업데이트 (chat_mod → cp_mod, llm_router mock)
- [x] 전체 테스트 137/137 통과

**Codex에게 전달할 브리핑:**
- 능동 알림 주기 제어 API 완료.
- 프론트는 말풍선 띄우기 전 `POST /proactive/check` 필수 호출.
- 오너 무시 감지 시 `POST /proactive/ignored` 호출.
- 오너 타이핑 중 알림 대기는 프론트 책임 (백엔드 미관여).
- API 계약: API_CONTRACT.md /proactive/* 섹션 참고.
- 버그픽스 브리핑:
  - /chat 400 에러 수정됨 — `"think": False` payload 필드 추가
  - /mood/stream SSE 헤더 보강 — nginx 환경 드롭 방지
  - /settings/models rglob 정렬 추가 — PMX 여러 개일 때 결정론적 선택
  - mem0 실제 동작에는 ollama에 nomic-embed-text 필요: ollama pull nomic-embed-text

---

## 🟡 Codex 상태 (프론트엔드 전담)
> 이 섹션은 Codex만 수정합니다.

```
현재 작업 브랜치: codex/phase3-ux-d
현재 작업 중인 파일: 없음 (소유권 해제)
마지막 완료: Phase 3-D STT + TTS + generative character motion system 완료. STT/TTS/lipsync/characterController/useMotionStream + ChatWindow/CharacterOverlay 연동 + 테스트/빌드 검증 완료 (2026-03-24)
블로커: 없음
다음 작업: dev PR 생성 대기. Handoff: "Phase 3-D complete. Generative motion: characterController.js (motion_sequence JSON). STT: sttService. TTS: ttsService. Lipsync: lipSyncService. Needs GET /settings/models/current-context from PROMPT_04-6B."
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
- [x] Settings UI 확장: `/settings/llm/models` 렌더, role=chat 메인 채팅 모델만 선택 가능
- [x] README 실행 가이드/비공개 자산 위치/AI 모델 정책 문서화
- [x] Phase 3 마감 검증: `npm test` (13/13), `npm run build`
- [x] Phase 3-B: chat/settings 단일 `mainWindow` 통합 + Alt+H 토글/트레이/우클릭 탭 열기
- [x] Phase 3-B: 채팅 탭 사이드바 + 룸 선택 + `room_change` SSE 반영 + 자동/수동 룸 전환
- [x] Phase 3-B: AFK 감지 + 시간대 기반 능동 반응 + `/proactive/check`/`/proactive/ignored` 연결
- [x] Phase 3-B: 프론트 테스트 34/34 통과, `npm run build` 통과

**Claude Code에게 전달할 브리핑:**
- mainWindow unified. Sidebar done. room_change SSE done. Proactive reactions done. Settings tab is empty 05-C fills it.
- `electron-store` 추가: `mainWindowPos`, `characterPinned`, `onboardingDone`를 메인 프로세스에서 저장.
- `/chat` 호출에 `interaction_type`, `voice_mode` 연결 완료. `room_change`는 `/chat` SSE와 `/mood/stream` 둘 다 수용하게 프론트에서 처리.
- 자동 검증 완료: `npm test` 34/34 통과, `npm run build` 통과.
- 수동 확인은 미실행: Alt+H, 탭 전환, 사이드바, room auto-switch, AFK, 시간 반응, position memory는 오너 환경에서 최종 확인 필요.

---

## 📋 오너 확인 필요
> 결정이 필요하거나 에이전트가 막힌 경우 여기에 기록합니다.

- 없음

---

## ✅ 기획 완료 항목 (변경 없음)
- [x] 프로젝트 기획 확정
- [x] 전체 아키텍처 설계
- [x] DB 스키마 확정
- [x] 기술 스택 확정
- [x] AGENTS.md 최종 작성
- [x] CLAUDE.md 작성
- [x] CODEX.md 작성
- [x] GitHub 레포 생성

---

## ⬇️ 다음 지시사항 — Phase 1 시작

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
그리고 STATUS.md 를 반드시 읽어 현재 작업 상태와 파일 소유권을 확인하세요.
이 문서들이 모든 설계와 상태의 기준입니다.

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

3. API 엔드포인트 — API_CONTRACT.md 계약서 그대로 구현
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
STATUS.md 업데이트:
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
그리고 STATUS.md 를 반드시 읽어 현재 작업 상태와 파일 소유권을 확인하세요.
이 문서들이 모든 설계와 상태의 기준입니다.

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
(API_CONTRACT.md 계약서 참고 — 이 스펙대로 호출할 것)

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
STATUS.md 업데이트:
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

## 10-A. Backend Handoff Notes For Claude Code

Date: 2026-03-18
Recorded by: Codex
Frontend branch: `codex/phase3-settings`

Open backend-side issues that block or weaken the current Phase 3 frontend:

1. `GET /settings/models` needs recursive model discovery.
- Current implementation only scans direct children like `assets/character/<folder>/*.model3.json` or `*.pmx`.
- This misses nested distributions such as:
  - `assets/character/March_7th/March 7th/march 7th.model3.json`
- Requirement:
  - recursively search inside each character folder
  - preserve current priority: `live2d (.model3.json) > pmx (.pmx)`
  - keep returned paths repo-relative so frontend can resolve them unchanged

2. Character model scanning should tolerate realistic third-party model layouts.
- Nested folders, spaces, and non-ASCII filenames should not cause models to disappear from Settings.
- Do not require users to manually flatten vendor model packages just to make them appear.

3. `POST /chat` currently fails against Ollama with `400 Bad Request` in local testing.
- Observed backend log:
  - `POST http://localhost:11434/api/chat "HTTP/1.1 400 Bad Request"`
- Confirm request payload compatibility with installed Ollama and selected chat model.
- Installed model policy confirmed by owner:
  - main chat default: `qwen3:14b`
  - worker fixed: `qwen3:4b`
  - vision fixed: `qwen3-vl:8b`

4. Re-check the real `/mood/stream` behavior against API_CONTRACT.md.
- Frontend has entered polling fallback mode during local testing.
- Verify:
  - SSE headers
  - 30s heartbeat behavior
  - `mood_change` event shape
  - `model_change` event shape
  - connection stability
- If implementation differs from the contract, record it in STATUS.md before changing frontend assumptions.

5. Preserve frontend contract unless explicitly coordinated.
- Frontend currently depends on:
  - `GET /settings/models`
  - `POST /settings/models/select`
  - `GET /settings/llm/models`
  - `POST /settings/llm/select`
  - `GET /mood/stream`
- Do not change payload shape silently.

Frontend status relevant to this handoff:
- PMX renderer path exists and now loads local PMX files.
- Live2D renderer path exists and requires local `assets/live2d/live2dcubismcore.min.js`.
- Chat/settings windows now have custom drag/minimize/maximize-close controls because they are frameless Electron windows.
- Character model selection is also broadcast locally so the overlay can refresh even when SSE falls back temporarily.

---

## Codex Update - 2026-03-25

Branch: `codex/phase3-ux-d`

- Settings UI was reworked into a product-style layout:
  - left section navigation
  - right detail panel
  - fixed bottom action bar
  - right-panel-only scrolling
- MainWindow, ChatWindow, and Settings labels were cleaned up to remove broken text rendering.
- Character settings now surface current model state and viewport controls more clearly.
- Frontend validation after the UI rework:
  - `npm test -- --runInBand` passed
  - `npm run build` passed
- Local note:
  - `frontend/electron/main.js` still contains the uncommitted Electron Store ESM fix required for app startup.

### Owner Feedback / Next Session Priority

The following issues were reported by the owner and should be treated as first-priority follow-up work on the next session.

1. Settings page UX is still below bar.
- Current layout is neither a clean accordion nor a well-resolved sidebar/detail settings pattern.
- Information hierarchy is weak, section boundaries are unclear, and the overall screen does not feel product-grade.
- Sidebar itself is not scrollable.
- Window size is fixed, which makes dense settings UI harder to use.
- Button sizing and visual rhythm are too uniform, so the screen does not guide attention well.
- Text blocks are too raw and uneven, causing section heights and density to feel inconsistent.
- Next pass should focus on proper UX structure first, not just styling on top of the current layout.

2. Character tip behavior is too frequent / always-on.
- Tip bubbles should not feel like a 24-hour looping banner.
- They should appear only occasionally and under explicit timing or situation rules.
- Next pass should define concrete triggers, cooldowns, and suppression rules before adjusting presentation.

3. Character positioning inside the viewport is not solved.
- Owner cannot reliably reposition the character within the viewport when it is off-frame or poorly placed.
- Requested capability: explicit in-viewport position adjustment, not just viewport scale.
- Next pass should verify whether this capability exists at all; if not, add proper x/y offset controls and renderer application.

## Codex Update - 2026-03-25 (UI mockup pass)

Branch: `codex/phase3-ux-d`

- Rebuilt the desktop shell to match the supplied mockup tone more closely:
  - compact titlebar
  - reference-style tab bar
  - darker panel system with violet accent
- Reworked `ChatWindow` into a web AI chat layout:
  - left room rail
  - feed-first message area
  - starter prompt cards
  - cleaner composer and feedback chips
- Reworked `Settings` into a sidebar/detail layout based on the HTML reference:
  - section navigation
  - hero/model panel
  - local character position preview with snap points and x/y sliders
  - integration status cards
- Validation:
  - `npm test -- --runInBand` passed
  - `npm run build` passed

## Codex Update - 2026-03-25 (reference parity + viewport wiring)

Branch: `codex/phase3-ux-d`

- Fixed a real mismatch with the provided 420px mockup:
  - the previous responsive breakpoint hid the left settings/chat sidebars at the exact mockup width
  - the sidebar collapse breakpoint is now reduced so the reference two-column layout remains visible at the intended desktop width
- Character viewport controls are now actually wired instead of preview-only:
  - `positionX`, `positionY`, `viewportScale`, and `opacity` are stored in app settings
  - the settings panel edits those values directly
  - the character overlay reads them on load and updates live through the shared `hana-overlay` broadcast channel
- Main window chrome was corrected for actual desktop use:
  - resize is enabled
  - maximize toggle button added to the titlebar
- Validation:
  - `npm test -- --runInBand` passed
  - `npm run build` passed
- Remaining gap:
  - character x/y controls are preview-only in the settings UI and are not yet wired into the renderer/app persistence layer

## Codex Update - 2026-03-25 (runtime fix pass)

Branch: `codex/phase3-ux-d`

- Corrected the runtime issues reported after the mockup pass:
  - Ollama `400` now retries once without the `think` flag in [`backend/services/llm.py`](/E:/Projects/hana_project/hana_codex/backend/services/llm.py)
  - main Electron window is resizable again with minimum size constraints in [`frontend/electron/main.js`](/E:/Projects/hana_project/hana_codex/frontend/electron/main.js)
  - scroll containers were fixed for the chat rail, settings sidebar, drawer, and content panes in [`frontend/src/styles/app.css`](/E:/Projects/hana_project/hana_codex/frontend/src/styles/app.css)
- Re-aligned the UI closer to the provided HTML reference instead of the earlier condensed reinterpretation:
  - chat shell rebuilt around the reference left rail + feed layout in [`frontend/src/components/ChatWindow.jsx`](/E:/Projects/hana_project/hana_codex/frontend/src/components/ChatWindow.jsx)
  - settings panel rebuilt around reference-style sections and rows in [`frontend/src/components/Settings.jsx`](/E:/Projects/hana_project/hana_codex/frontend/src/components/Settings.jsx)
- Character model visibility was made more explicit:
  - detected model count is shown
  - empty state is shown if no character models are found
  - current model/type are surfaced directly in the character panel
- Validation:
  - `npm test -- --runInBand` passed
  - `npm run build` passed

## Codex Update - 2026-03-25 (Phase 3-E complete) 🟡

Branch: `codex/phase3-ux-d`

- Completed Phase 3-E full main-window UI rewrite from the supplied reference mockup.
- Rewrote the main desktop shell into the new frameless `MainWindow` structure:
  - titlebar
  - tab bar
  - preserved tab state between chat/settings
- Rebuilt the chat tab around the reference layout:
  - conversation list with `GET /conversations`
  - grouped history sidebar
  - history loading with `GET /history`
  - SSE streaming chat flow via `POST /chat`
  - `room_change` event handling
  - assistant feedback buttons
- Rebuilt the settings tab around the reference layout:
  - 6-panel sidebar navigation
  - pending/saved state pattern
  - save / cancel / reset flow
  - immediate character model selection
  - immediate LLM model selection
  - voice output mode wired to `outputModes.js`
- Added character position popup as a separate BrowserWindow:
  - popup route
  - IPC wiring
  - position/size apply flow
- Updated Electron main window behavior to match Phase 3-E requirements:
  - `frame: false`
  - `resizable: true`
  - persisted main window position and size via `electron-store`
  - min/max width constraints
- Validation:
  - `npm test -- --runInBand` passed
  - `npm run build` passed
- Release file ownership:
  - no files currently locked by Codex
- Handoff note:
  - "Phase 3-E complete. Full UI rewrite based on reference mockup.
    Chat tab: conversation list (GET /conversations), history loading (GET /history),
    SSE streaming, room_change events, feedback buttons.
    Settings tab: all 6 panels, pending state pattern, immediate model selection,
    character position popup (separate BrowserWindow).
    outputModes.js connected to VoicePanel.
    Ready for PROMPT_06 (memory system backend)."

## Codex Update - 2026-03-26 (05-D in progress, do not treat as complete) 🟡

Branch: `codex/phase3-ux-d`

Current status:
- Phase `05-D` is still in progress.
- Character positioning is partially improved, but not finished.
- Do not mark the character positioning / settings stability work as complete yet.

What was fixed in this pass:
- Separated `window placement` from `in-viewport character framing`.
  - Popup `X/Y` is now intended to control only the visible framing of the character model.
  - Character window screen position is persisted only through overlay drag, not popup apply.
- Fixed popup lifecycle.
  - Popup was previously being hidden instead of truly closed, so reopening reused stale state.
  - The popup now closes and rehydrates its state when reopened.
- Fixed false size inference in the popup.
  - Popup was inferring size preset from current window width.
  - That caused `Apply` to trigger unintended size/placement correction even when the user changed nothing.
  - Popup now reads the persisted `charPosition.size` value directly from Electron instead.
- Removed duplicate opacity behavior that made characters look washed out.
  - Default opacity was raised to `100`.
  - DOM opacity layering was removed from the overlay path so opacity is not visually double-applied.
- Removed hidden in-overlay framing controls that were fighting the popup.
  - Middle-button viewport shifting and wheel-based scaling were removed from the overlay.
  - Popup is now the intended UI for character framing.
- Split PMX framing logic away from Live2D logic.
  - Live2D remains on the simpler 2D offset path.
  - PMX now uses a separate framing calculation with its own focus point and fit distance.

Critical bug found and fixed:
- PMX position changes were visibly applying for only one frame, then snapping back.
- Root cause:
  - [`frontend/src/services/characterController.js`](/E:/Projects/hana_project/hana_codex/frontend/src/services/characterController.js)
    was still driving `renderer.model.position.y` during idle breathing for PMX models.
  - That silently overwrote the framing offset computed by
    [`frontend/src/components/characterRenderer.js`](/E:/Projects/hana_project/hana_codex/frontend/src/components/characterRenderer.js).
- Fix:
  - Disabled the direct PMX `position.y` overwrite in `CharacterController` for `__bodyY`.
  - PMX framing is now owned by `characterRenderer.js`, not by the motion controller.

Problems discovered during this pass:
- Multiple sources of truth existed for character placement:
  - `store.charPosition`
  - `appSettings.character.positionX/Y`
  - temporary popup state
  - runtime renderer state
- Popup state, window placement, and renderer state were mixed together.
- PMX and Live2D were incorrectly treated as if they could share the same framing math.
- Old settings paths and newer settings paths both touched character-related state, increasing regression risk.

Open issues for the next session:
- Character size slider still expands correctly but does not reliably shrink back down.
- Some toggle controls in Settings still do not actually work.
- PMX framing is improved but still needs more tuning and validation across real models.
- Need to verify that no legacy settings component path is still writing stale character state.
- Need to audit all character-related state writes so no hidden path reverts framing values again.

Files most relevant to continue from:
- [`frontend/src/components/characterRenderer.js`](/E:/Projects/hana_project/hana_codex/frontend/src/components/characterRenderer.js)
- [`frontend/src/components/CharacterOverlay.jsx`](/E:/Projects/hana_project/hana_codex/frontend/src/components/CharacterOverlay.jsx)
- [`frontend/src/components/settings/CharacterPositionPopup.jsx`](/E:/Projects/hana_project/hana_codex/frontend/src/components/settings/CharacterPositionPopup.jsx)
- [`frontend/src/services/characterController.js`](/E:/Projects/hana_project/hana_codex/frontend/src/services/characterController.js)
- [`frontend/src/hooks/useSettings.js`](/E:/Projects/hana_project/hana_codex/frontend/src/hooks/useSettings.js)
- [`frontend/electron/main.js`](/E:/Projects/hana_project/hana_codex/frontend/electron/main.js)
- [`frontend/electron/preload.js`](/E:/Projects/hana_project/hana_codex/frontend/electron/preload.js)

Validation completed in this pass:
- `npm test -- --runInBand` passed
- `npm run build` passed

Release file ownership:
- No files are intentionally locked by Codex, but `05-D` is ongoing and should resume from the files listed above.
