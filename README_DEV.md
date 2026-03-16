# HANA — 개발 시작 전 오너 준비 가이드 (README_DEV.md)

> 이 문서는 에이전트가 아니라 **오너(나)** 가 읽는 문서입니다.
> 개발을 시작하기 전, 그리고 각 Phase 진입 전에 필요한 것들을 정리했습니다.
> 여기 있는 것들은 에이전트가 직접 구해올 수 없고, **오너가 직접 준비해야 합니다.**

---

## 목차
1. [지금 당장 필요한 것 (Phase 1 전)](#1-지금-당장-필요한-것-phase-1-전)
2. [Phase 3 전 — 캐릭터 비주얼](#2-phase-3-전--캐릭터-비주얼)
3. [Phase 4 전 — API 키 & 외부 서비스](#3-phase-4-전--api-키--외부-서비스)
4. [Phase 4.5 전 — 음성](#4-phase-45-전--음성)
5. [Phase 5 전 — 파인튜닝 모델](#5-phase-5-전--파인튜닝-모델)
6. [Phase 6 전 — 마인크래프트](#6-phase-6-전--마인크래프트)
7. [.env 파일 템플릿](#7-env-파일-템플릿)

---

## 1. 지금 당장 필요한 것 (Phase 1 전)

### ✅ 소프트웨어 설치

| 항목 | 다운로드 주소 | 확인 방법 |
|------|-------------|-----------|
| Python 3.11 | https://www.python.org/downloads/ | `python --version` |
| Node.js (LTS) | https://nodejs.org/ | `node --version` |
| Git | https://git-scm.com/ | `git --version` |
| Ollama | https://ollama.com | `ollama --version` |
| Docker Desktop | https://www.docker.com/products/docker-desktop | Docker 아이콘 실행 확인 |
| Redis (Windows) | https://github.com/tporadowski/redis/releases | `redis-server` 실행 |
| PyCharm | https://www.jetbrains.com/pycharm/ | — |

### ✅ Ollama 모델 다운로드

터미널에서 아래 명령어 실행. **시간이 꽤 걸려요 (수 GB).**

```bash
# 메인 모델 (PC용 — 약 9GB)
ollama pull qwen3:14b

# 맥북용 대형 모델 (맥북에서 실행)
ollama pull qwen3:32b

# 소형 모델 — 자동 채점, 기억 추출, 일기 작성용 (약 2.5GB)
ollama pull qwen3:4b

# 비전 모델 — 화면 인식용 (약 5GB)
ollama pull qwen3:8b-instruct  # 또는 llava:latest
```

> 💡 전부 받으면 약 20GB 차지해요. 저장 공간 확인하고 진행하세요.
> 일단 `qwen3:14b` 하나만 받아도 Phase 1~2 시작 가능해요.

### ✅ 환경 변수 파일 생성

레포 루트에 `.env` 파일 생성. 아래 [7번 섹션](#7-env-파일-템플릿) 참고.

---

## 2. Phase 3 전 — 캐릭터 비주얼

Phase 3에서 화면에 하나가 올라올 때 보여줄 이미지나 모델이 필요해요.

### 옵션 A — 일단 아무 이미지나 (추천, 가장 빠름)

그냥 인터넷에서 귀여운 캐릭터 PNG 이미지 하나 구해서 `assets/character/` 에 넣으면 돼요.
저작권 걱정 없는 거 쓰려면:
- https://pixabay.com (무료, 상업용 가능)
- https://unsplash.com (무료)
- AI 이미지 생성 (Midjourney, DALL-E 등)

파일명: `assets/character/hana_idle.png` 로 저장

### 옵션 B — VRoid Studio로 직접 만들기 (무료, 퀄리티 ↑)

1. https://vroid.com/en/studio 에서 VRoid Studio 다운로드 (무료)
2. 슬라이더로 캐릭터 외모 조정
3. VRM 포맷으로 내보내기
4. `assets/character/hana.vrm` 으로 저장

> 코딩 없이 꽤 그럴듯한 3D 캐릭터 만들 수 있어요.

### 옵션 C — Booth.pm에서 Live2D 모델 구하기 (퀄리티 최고)

1. https://booth.pm 접속 (일본 창작자 마켓)
2. 검색창에 "Live2D 無料" (무료) 또는 "Live2D free" 검색
3. 마음에 드는 모델 다운로드
4. `assets/character/` 에 압축 해제

> ⚠️ 유료 모델도 많아요. 무료 필터 꼭 확인하세요.
> ⚠️ 라이선스 확인 필수. 대부분 개인 사용은 OK.

### 무드별 이미지 (옵션 A 선택 시)

무드 시스템이 있으니까 상태별 이미지가 있으면 더 좋아요.
최소한 이 두 가지만 있어도 돼요:

```
assets/character/
├── hana_idle.png       ← 기본 (IDLE)
├── hana_happy.png      ← 기쁠 때 (HAPPY)
├── hana_concerned.png  ← 걱정할 때 (CONCERNED)
├── hana_focused.png    ← 집중할 때 (FOCUSED)
└── hana_gaming.png     ← 게임 중 (GAMING)
```

---

## 3. Phase 4 전 — API 키 & 외부 서비스

### Brave Search API (웹 검색)

1. https://brave.com/search/api/ 접속
2. 회원가입 → "Free" 플랜 선택 (월 2,000회 무료)
3. API 키 발급
4. `.env` 파일에 추가:
   ```
   BRAVE_SEARCH_API_KEY=your_key_here
   ```

> 월 2,000회면 개인 사용에 충분해요. 초과 시 유료.

### Google Calendar (일정 연동)

1. https://console.cloud.google.com 접속
2. 새 프로젝트 생성
3. "Google Calendar API" 활성화
4. OAuth 2.0 클라이언트 ID 생성 (데스크탑 앱 타입)
5. `credentials.json` 다운로드
6. `backend/credentials/google_calendar_credentials.json` 에 저장

> ⚠️ `credentials/` 폴더는 반드시 `.gitignore` 에 포함. 절대 커밋 금지.

### GitHub 연동 (선택사항, Phase 4)

1. https://github.com/settings/tokens 접속
2. "Generate new token (classic)" 클릭
3. `repo` 권한 체크
4. `.env` 파일에 추가:
   ```
   GITHUB_TOKEN=your_token_here
   ```

---

## 4. Phase 4.5 전 — 음성

### Whisper 모델 (STT, 자동 다운로드)

별도 준비 불필요. Python에서 처음 실행 시 자동으로 다운로드돼요.
단, 한국어 인식 품질을 위해 `medium` 또는 `large` 모델 권장.

```python
# 코드에서 이렇게 지정하면 됨 (Claude Code가 처리)
model = whisper.load_model("medium")  # 약 1.5GB
```

### Kokoro TTS (기본 한국어 음성)

별도 준비 불필요. `pip install kokoro` 로 설치되고 모델 자동 다운로드.

### Coqui TTS (커스텀 목소리, 선택사항)

원하는 목소리의 음성 샘플이 필요해요.

```
준비할 것:
- 원하는 목소리로 읽은 한국어 텍스트 녹음 파일
- 5~10분 분량 권장 (많을수록 자연스러움)
- WAV 포맷, 22050Hz 샘플링 레이트
- 배경 소음 없는 조용한 환경에서 녹음

저장 위치: assets/voice_samples/hana_voice.wav
```

> 직접 녹음하거나, 유튜브 등에서 좋아하는 목소리 발췌 (개인 사용 목적으로만).

---

## 5. Phase 5 전 — 파인튜닝 모델

HuggingFace에서 원본 모델을 미리 받아두세요.
Ollama의 GGUF 버전과 다른 별도 파일이에요.

### HuggingFace 계정 만들기

1. https://huggingface.co 회원가입 (무료)
2. https://huggingface.co/settings/tokens 에서 Access Token 생성
3. `.env` 에 추가:
   ```
   HUGGINGFACE_TOKEN=your_token_here
   ```

### 파인튜닝용 원본 모델 다운로드

```bash
# huggingface-cli 설치
pip install huggingface_hub

# 로그인
huggingface-cli login

# Qwen3 14B 다운로드 (약 28GB — 시간 많이 걸려요)
huggingface-cli download Qwen/Qwen3-14B \
  --local-dir ./models/Qwen3-14B

# 저장 위치
models/
└── Qwen3-14B/    ← 파인튜닝 원본 (gitignore 필수!)
```

> ⚠️ `models/` 폴더는 `.gitignore` 에 포함. 절대 커밋 금지 (너무 큼).
> 파인튜닝은 Phase 5 진입 조건 (대화 1,000개 이상) 충족 후에 진행해요.
> 지금 당장 받을 필요 없고, Phase 5 가까워졌을 때 받으면 됩니다.

---

## 6. Phase 6 전 — 마인크래프트

### 마인크래프트 Java Edition

- 이미 소유하고 있다고 가정
- **Java Edition** 필수 (Bedrock Edition은 Mineflayer 미지원)
- 버전: 1.20.x 권장 (Mineflayer 호환성 가장 좋음)

### 로컬 서버 여는 법

```
마인크래프트 실행
→ 멀티플레이
→ 새 세계 만들기 (또는 기존 세계)
→ "로컬 네트워크에 개방" 클릭
→ 포트 번호 확인 (예: 25565)
```

`.env` 에 추가:
```
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=Hana
```

---

## 7. .env 파일 템플릿

레포 루트에 `.env` 파일을 만들고 아래 내용을 채워넣으세요.
`.env` 는 절대 Git에 커밋하지 마세요. `.gitignore` 에 이미 포함되어 있어요.

```env
# ── LLM ──────────────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_KEEP_ALIVE=-1
OLLAMA_MODEL=qwen3:14b
OLLAMA_MODEL_SMALL=qwen3:4b
OLLAMA_MODEL_VISION=qwen3:8b-instruct

# ── 백엔드 서버 ───────────────────────────────
BACKEND_PORT=8000
BACKEND_HOST=0.0.0.0

# ── 프론트엔드 ────────────────────────────────
VITE_API_BASE_URL=http://localhost:8000

# ── Redis / Celery ────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── 외부 API (Phase 4에서 필요) ───────────────
BRAVE_SEARCH_API_KEY=            # https://brave.com/search/api/
GITHUB_TOKEN=                    # https://github.com/settings/tokens (선택)

# ── HuggingFace (Phase 5에서 필요) ───────────
HUGGINGFACE_TOKEN=               # https://huggingface.co/settings/tokens

# ── 마인크래프트 (Phase 6에서 필요) ──────────
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=Hana

# ── 경로 ─────────────────────────────────────
DATA_DIR=./data
MODELS_DIR=./models
ASSETS_DIR=./assets
DIARY_DIR=./data/diary
ADAPTERS_DIR=./data/adapters
GOOGLE_CREDENTIALS_PATH=./backend/credentials/google_calendar_credentials.json
```

---

## 8. 단계별 준비 요약

| Phase | 준비할 것 | 예상 소요 시간 |
|-------|-----------|--------------|
| Phase 1 시작 전 | 소프트웨어 설치 + `qwen3:14b` 다운로드 + `.env` 생성 | 30분~1시간 |
| Phase 3 시작 전 | 캐릭터 이미지 준비 (옵션 A면 5분) | 5분~수 시간 |
| Phase 4 시작 전 | Brave Search API 키 발급 + Google Calendar 설정 | 30분 |
| Phase 4.5 시작 전 | (별도 준비 없음, 자동 다운로드) | — |
| Phase 5 시작 전 | HuggingFace 계정 + Qwen3-14B 원본 다운로드 (28GB) | 수 시간 |
| Phase 6 시작 전 | 마인크래프트 Java Edition 확인 | 5분 |

---

## 9. 자주 헷갈리는 것들

**Q. Ollama로 받은 모델이랑 HuggingFace 모델이 다른 거야?**
→ 네. Ollama = GGUF 포맷 (실행용). HuggingFace = safetensors 포맷 (파인튜닝용). 둘 다 필요해요.

**Q. API 키 어디다 저장해?**
→ 레포 루트의 `.env` 파일에만. 코드에 직접 쓰면 절대 안 돼요.

**Q. `.env` 파일 커밋하면 안 돼?**
→ 절대 안 돼요. API 키가 전 세계에 공개됩니다. `.gitignore` 에 포함되어 있으니 실수로라도 못 커밋해요.

**Q. 캐릭터 이름 아직 미정인데?**
→ 이름은 나중에 언제든 바꿀 수 있어요. 파일명이나 변수명은 지금은 `hana` 로 통일하고, 이름 정해지면 일괄 변경하면 됩니다.

**Q. 지금 다 준비해야 해?**
→ 아니에요. Phase 1 시작에는 소프트웨어 설치 + `qwen3:14b` + `.env` 만 있으면 됩니다. 나머지는 해당 Phase 가까워졌을 때 준비하면 돼요.

---

*마지막 업데이트: 초안 작성*
*다음 업데이트 예정: 각 Phase 진행하면서 필요한 항목 추가*
