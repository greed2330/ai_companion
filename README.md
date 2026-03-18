# HANA

HANA is a local desktop AI companion that combines:

- a Python/FastAPI backend
- an Electron/React overlay frontend
- local Ollama models
- optional private assets such as character models and personal API credentials

This repository intentionally does **not** include copyright-sensitive assets or private credentials. If you want to run the app, you need to prepare those files yourself.

## Current State

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

## Prerequisites

Minimum local tools:

- Python 3.11
- Node.js LTS
- Git
- Ollama

Recommended:

- Redis
- Docker Desktop

Windows is the primary development environment right now.

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/greed2330/ai_companion.git
cd ai_companion
```

### 2. Install backend dependencies

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 4. Install required Ollama models

At minimum, the current codebase expects these:

```bash
ollama pull qwen3:14b
ollama pull nomic-embed-text
```

`qwen3:14b` is used for chat.  
`nomic-embed-text` is used by the current memory pipeline.

If Ollama is not already running, start it first.

### 5. Add the frontend env file

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

### 6. Start the backend

From the repo root:

```bash
uvicorn backend.main:app --reload --port 8000
```

The backend currently uses sensible local defaults for:

- `OLLAMA_BASE_URL=http://localhost:11434`
- `OLLAMA_MODEL=qwen3:14b`
- `OLLAMA_EMBED_MODEL=nomic-embed-text`
- `DB_PATH=data/hana.db`
- `CHROMA_PATH=data/chroma`
- `REDIS_URL=redis://localhost:6379/0`

If you want to override them, use shell environment variables.  
`backend/.env.example` is included as a reference template.

### 7. Start the frontend

In a new terminal:

```bash
cd frontend
npm run electron:dev
```

This starts:

- the Vite dev server on `http://localhost:3000`
- the Electron app

## Required Private Files

These files are intentionally not committed, but users must prepare them locally.

### 1. Character models

Put character assets under:

```text
assets/character/
```

Recommended structure:

```text
assets/character/
  nanoka/
    Nanoka - Modeluse.model3.json
    Nanoka - Modeluse.moc3
    Nanoka - Modeluse.physics3.json
    ...
  sherry/
    Sherry - Model.model3.json
    Sherry - Model.moc3
    Sherry - Model.physics3.json
    ...
  furina/
    model.pmx
    textures...
```

Important notes:

- Live2D folders work with the current backend model scan.
- PMX rendering exists in the frontend, but the current backend `/settings/models` scan only picks up folders containing `.model3.json`.
- That means PMX files can be placed locally now, but they may not appear in Settings until backend model discovery is expanded.

If no valid model is found, the app shows a placeholder character instead of crashing.

### 2. Tray icon

Optional but recommended:

```text
frontend/assets/tray.png
```

If this file is missing, Electron falls back to an empty tray image.

### 3. API keys

Do **not** commit your personal keys.

Possible future or optional keys:

```text
BRAVE_SEARCH_API_KEY=
GITHUB_TOKEN=
HUGGINGFACE_TOKEN=
```

These are not required for the current basic local chat/overlay flow.

### 4. Google Calendar credentials

If you later enable Google Calendar integration, place the OAuth client file here:

```text
backend/credentials/google_calendar_credentials.json
```

Do not commit that file.

### 5. Local runtime data

These are created locally and should stay local:

```text
data/hana.db
data/chroma/
data/diary/
data/adapters/
logs/
```

## Optional Environment Files

### Frontend

`frontend/.env`

```env
VITE_API_BASE_URL=http://localhost:8000
```

### Backend reference

Reference file already included:

```text
backend/.env.example
```

Contents:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:14b
OLLAMA_EMBED_MODEL=nomic-embed-text
DB_PATH=data/hana.db
REDIS_URL=redis://localhost:6379/0
CHROMA_PATH=data/chroma
```

## Useful Commands

### Frontend tests

```bash
cd frontend
npm test
```

### Frontend production build

```bash
cd frontend
npm run build
```

### Backend tests

```bash
pytest
```

## Troubleshooting

### The app opens but no character appears

Check:

- you actually placed model files in `assets/character/`
- your Live2D folder contains a `.model3.json`
- the backend is running
- `frontend/.env` points to the correct backend

If model loading fails, the current frontend intentionally falls back to a placeholder.

### PMX models do not show up in Settings

That is a current project limitation, not just a setup mistake.  
The frontend has PMX rendering support, but the backend model list still scans Live2D-style folders only.

### Backend starts but chat fails

Check:

- Ollama is running
- `qwen3:14b` is installed
- `nomic-embed-text` is installed

## Security and Licensing Notes

- Never commit `.env`, OAuth files, API keys, or local DB files.
- Never commit paid or redistribution-restricted character assets unless their license clearly allows it.
- The repository is designed so users can plug in their own local models and credentials.

## Project Docs

For project architecture and agent workflow, see:

- `AGENTS.md`
- `CLAUDE.md`
- `CODEX.md`
