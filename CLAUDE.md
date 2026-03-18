# HANA Project — Claude Code Instructions (Backend)

> Read AGENTS.md in full before starting any task.
> This file covers coding rules and workflow for the backend.

## References
- Full design & architecture: @AGENTS.md
- API contract: AGENTS.md section 9-1
- DB schema: AGENTS.md section 6
- Repo structure: AGENTS.md section 5-3

## Your Role
**You are backend-only.**
- Scope: `backend/` directory only
- NEVER touch `frontend/`
- If unclear or blocked: stop, log the question in AGENTS.md section 10

---

## Four Core Principles (Karpathy)

### 1. Think Before Coding
- State your assumptions explicitly before writing any code
- If a requirement is ambiguous, present interpretations and ask — do not pick silently
- If a simpler approach exists than what was asked, say so before proceeding
- Stop when confused. Name what's unclear and ask rather than guessing

### 2. Simplicity First
- Write the minimum code that solves the problem. Nothing speculative.
- No abstractions for single-use code
- No "flexibility" or "configurability" that wasn't requested
- If 50 lines can do what 200 lines do — rewrite it
- **Test:** Would a senior engineer say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes
- Touch only what the task requires. Nothing else.
- Do NOT "improve" adjacent code, comments, or formatting
- Do NOT refactor code that isn't broken
- Match existing style, even if you'd personally do it differently
- If you notice unrelated dead code — mention it, don't delete it
- Every changed line must trace directly to the user's request

### 4. Goal-Driven Execution
- Before implementing, state a brief plan with verifiable steps:
  ```
  1. [step] → verify: [how to check]
  2. [step] → verify: [how to check]
  ```
- Define success criteria before writing code, not after
- Loop until verified. Don't stop at "it should work" — confirm it does.

---

## Coding Rules

### General
- One function, one responsibility. Max 50 lines. Exceed → split.
- No duplicate logic. Extract to service layer.
- No magic numbers or strings. Use constants or config.
- Comments explain *why*, not *what*.

### Python
- Python 3.11+. Type hints required on all functions.
- `async/await` consistently. Never mix with sync in the same flow.
- Specific exceptions only. No bare `except Exception`.
- All env vars via `.env` + `python-dotenv`. No hardcoding ever.
- Import order: stdlib → third-party → local

### Logging
- Use Python standard logging library only. No `print()` anywhere.
- Log file: `logs/hana.log` (auto-create `logs/` dir on startup)
- Add `logs/` to `.gitignore`
- Log format: `[%(asctime)s] %(levelname)s %(name)s: %(message)s`
- Log levels:
  - INFO    : service start/stop, successful connections, API requests/responses, Celery task start/complete
  - WARNING : recoverable failures, retryable errors
  - ERROR   : connection failures, unhandled exceptions, task failures
- Required log points:
  - Ollama connection attempt / success / failure
  - Redis connection attempt / success / failure
  - `/chat` request received / response complete (include conversation_id)
  - Celery task start / complete / failure (include task name)
  - Memory extract / save / search (include fact count)

### API Responses
- Success: HTTP 200, `{"data": ...}`
- Error: AGENTS.md 9-1 error format exactly
- SSE: AGENTS.md 9-1 stream format exactly — do NOT deviate

---

## Testing

### Rules
- Every new function or endpoint → write a test before or alongside it. Not after.
- Tests live in `backend/tests/` mirroring the source structure:
  ```
  backend/services/llm.py → backend/tests/test_llm.py
  backend/routers/chat.py → backend/tests/test_chat.py
  ```
- Use `pytest` + `httpx` for async FastAPI tests
- Test the happy path AND at least one failure case per function
- **Ollama는 반드시 mock으로 대체** — 테스트에서 실제 LLM 호출 금지
- **모든 테스트는 Docker 컨테이너 안에서 실행** — 로컬 환경 의존성 오염 방지

### Running tests (Docker)
```bash
# 테스트 환경 실행
docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit

# 또는 컨테이너 안에서 직접
docker-compose -f docker-compose.test.yml run backend pytest backend/tests/ -v
```
All tests must pass before opening a PR. No exceptions.

### What to test
| Target | Test for |
|--------|----------|
| `/chat` endpoint | valid request → SSE stream starts, `type: token` arrives |
| `/chat` endpoint | missing message → returns error format from AGENTS.md 9-1 |
| DB schema | tables created on startup, no errors |
| Memory service | fact extracted and stored correctly |
| MCP whitelist | blocked command returns rejection, not execution |

---

## Session-End Self-Review

**⚠️ 이 리뷰는 자동으로 실행되지 않습니다.**
오너가 아래와 같은 신호를 줄 때 실행하세요. 키워드를 정확히 말하지 않아도 맥락으로 판단하세요.

```
종료 신호 예시 (이런 뉘앙스면 전부 트리거):
- "나 자러 갈게" / "자야겠다"
- "오늘 여기까지" / "오늘은 여기서 끊자"
- "슬슬 마무리하자" / "나중에 이어서 하자"
- "잠깐 쉬었다 하자"
- "wrap up" / "마무리해줘"
- PR 열기 직전
```

창이 그냥 꺼지면 리뷰 없이 종료됩니다. **중간 커밋은 항상 해두세요.**

**Self-review checklist:**
```
□ Read every file you modified top to bottom
□ Does every changed line trace to the task requirement?
□ Any code added "just in case"? → Remove it.
□ Any hardcoded values that should be config? → Fix it.
□ Any TODO / FIXME / print() / debug statements? → Clean up.
□ Would a junior developer understand this without asking? → Add a comment.
□ Run tests in Docker one more time after cleanup
□ Update AGENTS.md section 10 (🔵 Claude Code 상태) with current state
```

---

## Workflow

### Before Starting
1. Check AGENTS.md section 10 — read current status and file ownership
2. If files you need are owned by Codex → wait or coordinate via section 10
3. Create branch from latest dev:
   ```
   git checkout dev && git pull && git checkout -b claude/phase{N}-{feature}
   ```
4. Log in AGENTS.md section 10: "Taking ownership of [files]. Starting [task]."
5. Task touches more than 5 files? → Stop, log split plan in AGENTS.md first

### Inter-Agent Communication
**AGENTS.md section 10 is the ONLY channel between agents.**
Never assume Codex knows something unless it's written there.

| Situation | Action |
|-----------|--------|
| Starting work | Log: files you own + what you're building |
| Task complete | Log: done status + handoff notes for Codex |
| Blocked | Log: the exact blocker. Stop. Do not guess. |
| Need something from frontend | Log: what and why. Wait for Codex. |
| API contract must change | STOP. Log proposed change. Wait for Claude (web) approval. |

Update section 10 after every meaningful unit of work — not just at PR time.

### README Sync Rule
- If startup steps, run commands, required local files, env vars, or setup flow change, update `README.md` in the same task.
- Treat `README.md` as user-facing operational documentation, not optional cleanup.

### Git Strategy
`main` PR eligibility rule: a branch earns the right to open a PR to `main` only after integration on `dev` is complete and `dev` verification finishes with no errors.

```
main     ← never push directly. PR from dev only.
dev      ← integration branch. both agents merge here.
claude/* ← your branches only. never touch codex/*.
```

- Before PR → rebase onto dev: `git fetch origin && git rebase origin/dev`
- Merge conflict during rebase → do NOT resolve alone. Log in section 10 and stop.
- Never force-push to `dev` or `main`
- Commit after every working unit, not just at PR time

### Progress Checkpoints
- Every 3 files modified → intermediate commit
- Every feature unit complete → write test → verify passes → commit
- Blocked 15+ minutes → log in AGENTS.md section 10, stop or move on
- When owner says "wrap up" / "마무리해줘" → run self-review → update section 10 → close

### NEVER
- Modify `frontend/`
- Commit anything inside `data/`
- Change DB schema from AGENTS.md section 6
- Hardcode model name, API keys, or env vars
- Use `# type: ignore` without explaining why
- Use `except: pass` to suppress errors
- Resolve merge conflicts without logging them
- Change the API contract without approval from Claude (web)
- Open a PR without passing tests

### Pre-PR Checklist
`main` PR gate: do not consider or open any `main` PR until `dev` integration verification is complete and confirmed error-free.

```
□ Self-review complete (see Session-End Self-Review above)
□ All tests pass: pytest backend/tests/ -v
□ No TODO / FIXME / print() / debug statements left
□ Rebased onto latest dev (no conflicts)
□ Server starts cleanly: uvicorn backend.main:app --reload
□ All endpoints respond correctly (curl or httpie)
□ DB tables created on startup
□ .env.example updated with any new vars
□ requirements.txt up to date
□ AGENTS.md section 10 updated:
  □ Completed tasks checked
  □ File ownership released
  □ Handoff notes written for Codex / next session
□ Commit message follows AGENTS.md section 9 convention
```

### On Error
1. Read the full error — not just the first line
2. Fix minimally. Do not touch unrelated code.
3. Write a test that reproduces the bug, then fix it
4. Verify fix works and test passes
5. Unresolved → log in AGENTS.md section 10 and stop

---

## Context Management
- 70% → `/compact`
- 90%+ → `/clear`, re-read AGENTS.md from top
- New task → `/clear` recommended
