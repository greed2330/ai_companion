# HANA

> 🇺🇸 English | 🇰🇷 [한국어](#한국어)

---

## English

HANA is a local desktop AI companion that combines:

- a Python/FastAPI backend
- an Electron/React overlay frontend
- local Ollama models
- optional private assets such as character models and personal API credentials

This repository intentionally does **not** include copyright-sensitive assets or private credentials. If you want to run the app, you need to prepare those files yourself.

### Current State

The repository currently contains:

- backend chat API, history, feedback, mood stream, settings model endpoints
- Electron overlay frontend with:
  - always-on-top character window
  - chat overlay window
  - settings window
  - tray menu
  - Live2D/PMX renderer paths with graceful fallback

The repository does **not** contain:

- character model files under `assets/character/`
- your API keys or OAuth credentials
- your local conversation database under `data/`
- optional fine-tuning source models under `models/`

### Prerequisites

Minimum local tools:

- Python 3.11
- Node.js LTS
- Git
- Ollama

Recommended:

- Redis
- Docker Desktop

Windows is the primary development environment right now.

### Quick Start

#### 1. Clone the repo

```bash
git clone https://github.com/greed2330/ai_companion.git
cd ai_companion
```

#### 2. Install backend dependencies

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
```

#### 3. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

#### 4. Install required Ollama models

```bash
ollama pull qwen3:14b
ollama pull qwen3:4b
ollama pull qwen3-vl:8b
ollama pull nomic-embed-text
```

`qwen3:14b` is the default main chat model.
`qwen3:4b` is used for smaller worker-style tasks.
`qwen3-vl:8b` is reserved for vision.
`nomic-embed-text` is used by the current memory pipeline.

If Ollama is not already running, start it first.

#### 5. Add the frontend env file

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

#### 6. Start the backend

From the repo root:

```bash
uvicorn backend.main:app --reload --port 8000
```

The backend uses sensible local defaults. Override with shell environment variables if needed.
`backend/.env.example` is included as a reference template.

#### 7. Start the frontend

In a new terminal:

```bash
cd frontend
npm run electron:dev
```

This starts:

- the Vite dev server on `http://localhost:3000`
- the Electron app

### Required Private Files

#### 1. Character models

Put character assets under:

```text
assets/character/
```

Recommended structure:

```text
assets/character/
  nanoka/
    Nanoka - Modeluse.model3.json   ← Live2D
    ...
  furina/
    model.pmx                       ← PMX
    textures...
```

Both Live2D (`.model3.json`) and PMX (`.pmx`) are supported.
If no valid model is found, the app shows a placeholder instead of crashing.

### 1-1. Live2D Cubism Core

Live2D models also need the Cubism Core runtime file, which is not bundled in this repository.

Place it here:

```text
assets/live2d/live2dcubismcore.min.js
```

Without this file, Live2D models will fall back to the placeholder even if `.model3.json` files exist.

### 2. Tray icon

Optional but recommended:

```text
frontend/assets/tray.png
```

If missing, Electron falls back to an empty tray image.

#### 3. API keys

Do **not** commit your personal keys. These are not required for basic local chat:

```text
SERPER_API_KEY=
GITHUB_TOKEN=
HUGGINGFACE_TOKEN=
```

#### 4. Google Calendar credentials

If you later enable Google Calendar integration:

```text
backend/credentials/google_calendar_credentials.json
```

Do not commit that file.

#### 5. Local runtime data

Created locally, stays local:

```text
data/hana.db
data/chroma/
data/diary/
data/adapters/
logs/
```

### AI Model Selection Policy

- **chat model**: user-selectable in Settings UI
- **worker model**: fixed (`OLLAMA_WORKER_MODEL` env var)
- **vision model**: fixed (`OLLAMA_VISION_MODEL` env var)

Default setup:

```text
Chat   : qwen3:14b
Worker : qwen3:4b
Vision : qwen3-vl:8b
```

### Useful Commands

```bash
# Backend tests
pytest

# Frontend tests
cd frontend && npm test

# Frontend production build
cd frontend && npm run build
```

### Troubleshooting

**The app opens but no character appears**

- Check that model files are placed in `assets/character/`
- Live2D folder must contain a `.model3.json`, PMX folder must contain a `.pmx`
- Check that the backend is running
- Check that `frontend/.env` points to the correct backend URL

**Backend starts but chat fails**

- Check that Ollama is running
- Check that `qwen3:14b` is installed (`ollama list`)
- Check that `nomic-embed-text` is installed

### Security and Licensing Notes

- Never commit `.env`, OAuth files, API keys, or local DB files.
- Never commit paid or redistribution-restricted character assets unless the license clearly allows it.

### Project Docs

- `AGENTS.md` — architecture, DB schema, agent workflow
- `CLAUDE.md` — backend coding rules
- `CODEX.md` — frontend coding rules

---

## 한국어

HANA는 로컬 데스크탑 AI 동반자예요. 구성 요소:

- Python/FastAPI 백엔드
- Electron/React 오버레이 프론트엔드
- 로컬 Ollama 모델
- 캐릭터 모델, API 키 등 개인 자산 (별도 준비 필요)

저작권 민감 자산이나 개인 인증정보는 이 레포에 포함되어 있지 않아요.
앱을 실행하려면 해당 파일들을 직접 준비해야 해요.

### 현재 구현 상태

포함된 것:

- 백엔드 채팅 API, 히스토리, 피드백, 무드 스트림, 설정 엔드포인트
- Electron 오버레이 프론트엔드:
  - 항상 위(always-on-top) 캐릭터 창
  - 채팅 오버레이 창
  - 설정 창
  - 시스템 트레이 메뉴
  - Live2D/PMX 렌더러 (없으면 placeholder fallback)

포함되지 않은 것:

- `assets/character/` 하위 캐릭터 모델 파일
- API 키, OAuth 인증정보
- `data/` 하위 로컬 대화 DB
- `models/` 하위 파인튜닝 소스 모델

### 사전 준비

필수:

- Python 3.11
- Node.js LTS
- Git
- Ollama

권장:

- Redis
- Docker Desktop

현재 주 개발 환경은 Windows예요.

### 빠른 시작

#### 1. 레포 클론

```bash
git clone https://github.com/greed2330/ai_companion.git
cd ai_companion
```

#### 2. 백엔드 의존성 설치

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
```

#### 3. 프론트엔드 의존성 설치

```bash
cd frontend
npm install
cd ..
```

#### 4. Ollama 모델 설치

```bash
ollama pull qwen3:14b
ollama pull qwen3:4b
ollama pull qwen3-vl:8b
ollama pull nomic-embed-text
```

`qwen3:14b` — 기본 채팅 모델
`qwen3:4b` — 소형 워커 태스크용
`qwen3-vl:8b` — 비전 전용 (화면 인식)
`nomic-embed-text` — 메모리 파이프라인 임베딩용

실행 전 Ollama가 켜져 있어야 해요.

#### 5. 프론트엔드 env 파일 추가

`frontend/.env` 파일 생성:

```env
VITE_API_BASE_URL=http://localhost:8000
```

#### 6. 백엔드 실행

레포 루트에서:

```bash
uvicorn backend.main:app --reload --port 8000
```

백엔드 기본값은 로컬 환경에 맞게 설정되어 있어요.
변경이 필요하면 환경변수로 오버라이드하세요. `backend/.env.example` 참고.

#### 7. 프론트엔드 실행

새 터미널에서:

```bash
cd frontend
npm run electron:dev
```

실행 결과:

- Vite 개발 서버 → `http://localhost:3000`
- Electron 앱 실행

### 필수 개인 파일

#### 1. 캐릭터 모델

`assets/character/` 하위에 모델 파일을 넣으세요:

```text
assets/character/
  nanoka/
    Nanoka - Modeluse.model3.json   ← Live2D
    ...
  furina/
    model.pmx                       ← PMX
    textures...
```

Live2D (`.model3.json`)와 PMX (`.pmx`) 모두 지원돼요.
유효한 모델이 없으면 앱이 크래시 대신 placeholder를 표시해요.

#### 2. 트레이 아이콘

선택사항이지만 권장:

```text
frontend/assets/tray.png
```

없으면 Electron이 빈 트레이 이미지로 대체해요.

#### 3. API 키

개인 키는 절대 커밋하지 마세요. 현재 기본 채팅에는 불필요해요:

```text
SERPER_API_KEY=
GITHUB_TOKEN=
HUGGINGFACE_TOKEN=
```

#### 4. Google Calendar 인증정보

추후 Google Calendar 연동 시:

```text
backend/credentials/google_calendar_credentials.json
```

이 파일은 커밋하지 마세요.

#### 5. 로컬 런타임 데이터

로컬에서 자동 생성되며 로컬에만 존재:

```text
data/hana.db
data/chroma/
data/diary/
data/adapters/
logs/
```

### AI 모델 선택 정책

- **채팅 모델**: 설정 UI에서 사용자가 변경 가능
- **워커 모델**: 고정 (`OLLAMA_WORKER_MODEL` env var)
- **비전 모델**: 고정 (`OLLAMA_VISION_MODEL` env var)

기본 설정:

```text
채팅   : qwen3:14b
워커   : qwen3:4b
비전   : qwen3-vl:8b
```

### 유용한 명령어

```bash
# 백엔드 테스트
pytest

# 프론트엔드 테스트
cd frontend && npm test

# 프론트엔드 프로덕션 빌드
cd frontend && npm run build
```

### 트러블슈팅

**앱이 열렸는데 캐릭터가 안 보여요**

- `assets/character/` 에 모델 파일이 있는지 확인
- Live2D 폴더에 `.model3.json`, PMX 폴더에 `.pmx` 파일이 있어야 해요
- 백엔드가 실행 중인지 확인
- `frontend/.env`의 백엔드 URL이 맞는지 확인

**백엔드는 켜졌는데 채팅이 안 돼요**

- Ollama가 실행 중인지 확인
- `qwen3:14b`가 설치됐는지 확인 (`ollama list`)
- `nomic-embed-text`가 설치됐는지 확인

### 보안 및 라이선스 주의사항

- `.env`, OAuth 파일, API 키, 로컬 DB 파일은 절대 커밋하지 마세요.
- 라이선스가 명확히 허용하지 않는 한 유료 또는 재배포 제한 캐릭터 자산을 커밋하지 마세요.

### 프로젝트 문서

- `AGENTS.md` — 전체 아키텍처, DB 스키마, 에이전트 협업 규칙
- `CLAUDE.md` — 백엔드 코딩 규칙
- `CODEX.md` — 프론트엔드 코딩 규칙
