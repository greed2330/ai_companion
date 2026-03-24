# HANA — API 계약서 (Interface Contract)

> ⚠️ 이 계약서는 백엔드와 프론트가 서로 상의 없이 독립 작업하기 위한 약속입니다.
> Claude Code는 이대로 만들고, Codex는 이대로 호출합니다. 임의로 변경 금지.
> 변경이 필요하면 반드시 Claude (웹)에게 먼저 알리고 이 문서 업데이트 후 작업.
>
> 이 파일은 AGENTS.md 섹션 9-1에서 분리되었습니다. (2026-03-24)

---

## Base URL
```
개발: http://localhost:8000
```

## 공통 에러 응답 형식
```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "에러 설명"
}
```

## 엔드포인트 목록

---

**POST /chat** — 대화 (SSE 스트리밍)

요청:
```json
{
  "message": "하나야 안녕",
  "conversation_id": "uuid-or-null",
  "interaction_type": "coding",
  "voice_mode": false
}
```

`interaction_type` 값: `"coding"` | `"chat"` | `"game"` | null (auto-detect)
`voice_mode`: true이면 응답 후처리(이모지 제거, 50자 이내 단문화) + think 강제 비활성화

응답 (Server-Sent Events):
```
data: {"type": "token", "content": "안"}
data: {"type": "token", "content": "녕"}
data: {"type": "token", "content": "!"}
data: {"type": "done", "message_id": "uuid", "conversation_id": "uuid", "mood": "HAPPY"}
data: [DONE]
```

룸 변경 이벤트 (대화 내 룸 타입 전환 시):
```
data: {"type": "room_change", "room_type": "coding", "message": "코딩 대화로 바꿀게~"}
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
      "name": "Nanoka",
      "type": "live2d"
    },
    {
      "id": "furina",
      "path": "assets/character/furina/furina.pmx",
      "name": "Furina",
      "type": "pmx"
    }
  ],
  "current": "nanoka"
}
```

type 값: `"live2d"` | `"pmx"`
우선순위: .model3.json(live2d) > .pmx. 둘 다 없으면 목록에서 제외.

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

**GET /settings/llm/models** — LLM 모델 목록 조회

Ollama에 설치된 모델 목록을 반환한다. role이 "chat"인 모델만 사용자가 변경 가능.

응답:
```json
{
  "models": [
    { "id": "qwen3:14b",   "name": "Qwen3 14B",   "role": "chat",   "current": true  },
    { "id": "qwen3:4b",    "name": "Qwen3 4B",    "role": "worker", "current": false },
    { "id": "qwen3-vl:8b", "name": "Qwen3 Vl 8B", "role": "vision", "current": false }
  ],
  "current_chat_model": "qwen3:14b"
}
```

role 정의 (고정):
- `"chat"`   → 메인 대화 모델 (사용자 변경 가능)
- `"worker"` → 채점/기억 추출 전용. 고정: `OLLAMA_WORKER_MODEL` env var
- `"vision"` → 화면 인식 전용. 고정: `OLLAMA_VISION_MODEL` env var

에러 응답:
```json
{"error": true, "code": "OLLAMA_UNAVAILABLE", "message": "Ollama에 연결할 수 없어."}
```

---

**POST /settings/llm/select** — LLM 챗 모델 변경

요청:
```json
{"model_id": "qwen3:14b"}
```

응답:
```json
{"success": true, "current_chat_model": "qwen3:14b"}
```

에러 응답 (Ollama에 없는 모델):
```json
{"error": true, "code": "MODEL_NOT_FOUND", "message": "Model not installed in Ollama"}
```

선택 즉시 in-memory 업데이트 + `data/settings.json` 저장. 서버 재시작 없이 반영됨.

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

---

**GET /settings/persona** — 페르소나 설정 조회 (Phase 3)

응답:
```json
{
  "ai_name": "하나",
  "owner_nickname": "",
  "speech_style": "",
  "speech_preset": "bright_friend",
  "personality": "",
  "personality_preset": "energetic",
  "interests": ""
}
```

---

**POST /settings/persona** — 페르소나 설정 변경 (Phase 3)

요청:
```json
{
  "ai_name": "루나",
  "owner_nickname": "자기야",
  "speech_preset": "cheerful_girl",
  "personality_preset": "warm",
  "interests": "게임이랑 코딩"
}
```

응답:
```json
{"success": true}
```

변경 즉시 `data/settings.json` `persona` 키에 저장. 다음 `/chat` 요청부터 시스템 프롬프트에 반영.

---

**POST /settings/persona/preview** — 페르소나 말투 샘플 생성 (Phase 3)

요청:
```json
{"speech_preset": "tsundere", "personality_preset": "playful"}
```

응답:
```json
{"samples": ["...뭐야, 왜 봐.", "그런 거 신경 안 써도 되거든.", "잘 지냈어? 물어보는 거 아니야."]}
```

저장하지 않음. think 모드 강제 비활성화. LLM 3회 호출.

---

**GET /settings/autonomous** — 자율 행동 토글 상태 조회 (Phase 3)

응답:
```json
{
  "proactive_chat": false,
  "tip_bubbles": true,
  "screen_reaction": true,
  "schedule_reminder": false,
  "auto_crawl": false
}
```

---

**POST /settings/autonomous** — 자율 행동 토글 변경 (Phase 3)

요청 (변경할 필드만 전송 가능):
```json
{
  "proactive_chat": true,
  "tip_bubbles": true
}
```

응답:
```json
{"success": true, "autonomous": {"proactive_chat": true, "tip_bubbles": true, "screen_reaction": true, "schedule_reminder": false, "auto_crawl": false}}
```

변경 즉시 `data/autonomous.json` 저장. Celery 태스크들이 이 파일을 읽어 동작 여부 판단.

---

**POST /proactive/check** — 능동 알림 주기 체크 (Phase 4)

프론트가 말풍선 띄우기 전에 백엔드에 주기 체크 요청. 가능하면 log_id 반환.

요청:
```json
{"event_type": "night_snack"}
```

응답 (가능):
```json
{"can_trigger": true, "log_id": "uuid"}
```

응답 (불가):
```json
{"can_trigger": false, "reason": "already_triggered_today"}
```

---

**POST /proactive/ignored** — 오너 무시 기록 (Phase 4)

오너가 말풍선을 무시했을 때 프론트가 호출.

요청:
```json
{"log_id": "uuid"}
```

응답:
```json
{"success": true}
```

---

**GET /proactive/status** — 오늘 능동 알림 현황 조회 (Phase 4)

응답:
```json
{
  "mood_check_done_today": false,
  "autonomous_talk_count_today": 3,
  "autonomous_talk_remaining_today": 7,
  "last_autonomous_talk_minutes_ago": 45
}
```
