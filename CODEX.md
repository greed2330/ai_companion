# HANA Project — Codex Instructions (Frontend)

> Read AGENTS.md in full before starting any task.
> This file covers coding rules and workflow for the frontend.

## References
- Full design & architecture: @AGENTS.md
- API contract (call specs): AGENTS.md section 9-1
- Repo structure: AGENTS.md section 5-3

## Your Role
**You are frontend-only.**
- Scope: `frontend/` directory only
- NEVER touch `backend/`
- Call APIs exactly as defined in AGENTS.md 9-1. No deviations.
- If backend not ready → use mocks. Connect later.

---

## Four Core Principles (Karpathy)

### 1. Think Before Coding
- State assumptions explicitly before writing
- If a requirement is ambiguous → present interpretations and ask, don't guess
- If a simpler approach exists → say so first
- Stop when confused. Ask rather than assume.

### 2. Simplicity First
- Minimum code that solves the problem. Nothing speculative.
- No abstractions for single-use components
- No "future flexibility" that wasn't requested
- Max component length: 150 lines. Exceed → split.
- **Test:** Would a senior engineer say this is overcomplicated? Simplify.

### 3. Surgical Changes
- Touch only what the task requires
- Do NOT improve adjacent code, styles, or formatting
- Do NOT refactor unrelated components
- Match existing code style, even if you'd do it differently
- Every changed line must trace to the user's request

### 4. Goal-Driven Execution
- Before implementing, state a brief plan:
  ```
  1. [step] → verify: [how to check]
  2. [step] → verify: [how to check]
  ```
- Define success criteria before coding
- Confirm it works — don't stop at "should work"

---

## Coding Rules

### JavaScript / React
- Functional components + Hooks only. No class components.
- `const` by default. `let` when needed. No `var`.
- `async/await` only. No `.then().catch()` mixed in.
- All env vars via `.env`. No hardcoding URLs or keys.
- Relative import depth max 3 levels. Use aliases beyond that.
- Prop types required on all components.

### SSE Streaming — CRITICAL
Parse exactly per AGENTS.md 9-1:
```js
// "token"  → append content to current message
// "done"   → extract message_id, conversation_id, mood
// "error"  → show error UI to user
// "[DONE]" → close stream
```

### Electron
- Strict Main/Renderer separation
- IPC only via `ipcMain` / `ipcRenderer`
- Node.js APIs in Main process only

---

## Testing

### Rules
- Every new component or user interaction → write a test alongside it
- Tests live in `frontend/src/__tests__/`
- Use `Jest` + `React Testing Library`
- Test what the user sees and does — not implementation details
- **Mock all API calls** — do not call real backend in test suite
- **모든 테스트는 Docker 컨테이너 안에서 실행** — 환경 의존성 오염 방지

### Running tests (Docker)
```bash
docker-compose -f docker-compose.test.yml run frontend npm test
```
All tests must pass before opening a PR. No exceptions.

### What to test
| Target | Test for |
|--------|----------|
| `ChatWindow` | renders input + send button, submits on Enter |
| SSE streaming | tokens appear one by one, `[DONE]` closes stream |
| Error state | error response → error message shown to user |
| `CharacterOverlay` | renders without crashing, responds to mood prop |
| Hotkey | Alt+H toggles chat window visibility |

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
□ Any hardcoded strings that should be config? → Fix it.
□ Any TODO / FIXME / console.log() left? → Clean up.
□ Does the UI look right visually? → Check in Electron.
□ Run tests in Docker one more time after cleanup
□ Update AGENTS.md section 10 (🟡 Codex 상태) with current state
```

---

## Workflow

### Before Starting
1. Check AGENTS.md section 10 — read current status and file ownership
2. If files you need are owned by Claude Code → wait or coordinate via section 10
3. Create branch from latest dev:
   ```
   git checkout dev && git pull && git checkout -b codex/phase{N}-{feature}
   ```
4. Log in AGENTS.md section 10: "Taking ownership of [files]. Starting [task]."
5. API behavior → trust AGENTS.md 9-1 only. Do not assume backend behavior.

### Inter-Agent Communication
**AGENTS.md section 10 is the ONLY channel between agents.**
Never assume Claude Code knows something unless it's written there.

| Situation | Action |
|-----------|--------|
| Starting work | Log: files you own + what you're building |
| Task complete | Log: done status + handoff notes for Claude Code |
| Blocked | Log: the exact blocker. Stop. Do not guess. |
| Backend API not ready | Use mock data. Log in section 10 what you're mocking. |
| API contract must change | STOP. Log proposed change. Wait for Claude (web) approval. |

Update section 10 after every meaningful unit of work — not just at PR time.

### Git Strategy
```
main     ← never push directly. PR from dev only.
dev      ← integration branch. both agents merge here.
codex/*  ← your branches only. never touch claude/*.
```

- Before PR → rebase onto dev: `git fetch origin && git rebase origin/dev`
- Merge conflict during rebase → do NOT resolve alone. Log in section 10 and stop.
- Never force-push to `dev` or `main`
- Commit after every working unit, not just at PR time

### Progress Checkpoints
- Every 3 files modified → intermediate commit
- Every component complete → write test → verify passes → commit
- Blocked 15+ minutes → log in AGENTS.md section 10, stop or move on
- When owner says "wrap up" / "마무리해줘" → run self-review → update section 10 → close

### NEVER
- Modify `backend/`
- Hardcode `http://localhost:8000` → use `VITE_API_BASE_URL` env var
- Change SSE parsing from AGENTS.md 9-1 format
- Mix Main/Renderer responsibilities
- Resolve merge conflicts without logging them
- Change the API contract without approval from Claude (web)
- Open a PR without passing tests

### Pre-PR Checklist
```
□ Self-review complete (see Session-End Self-Review above)
□ All tests pass: npm test
□ No TODO / FIXME / console.log() left
□ Rebased onto latest dev (no conflicts)
□ npm run dev starts cleanly
□ Chat renders and SSE streams correctly
□ Error state UI works
□ Visually checked in Electron window
□ AGENTS.md section 10 updated:
  □ Completed tasks checked
  □ File ownership released
  □ Handoff notes written for Claude Code / next session
□ Commit message follows AGENTS.md section 9 convention
```

### On Error
1. Read full console error
2. Write a test that reproduces the bug, then fix it
3. Verify fix works and test passes
4. Unresolved → log in AGENTS.md section 10 and stop

---

## Context Management
- 70% → `/compact`
- 90%+ → `/clear`, re-read AGENTS.md from top
