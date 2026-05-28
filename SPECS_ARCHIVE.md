# HANA — SPEC 아카이브 (구현 완료)

> 이 파일에는 **구현 완료된** 유지보수 SPEC(03-09)의 전체 설계 문서가 보관됩니다.
> 일상적인 작업 중에는 참조할 필요가 없습니다.
> 구현 세부 사항 확인 또는 롤백이 필요한 경우에만 참고하세요.

완료 날짜: 2026-04-14

---

### [SPEC-03] 컨텍스트 파이프라인 무결성 검증
> 기능은 구현되어 있는데 LLM에게 전달되는 프롬프트에 실제로 반영되지 않는 경우들. 기능을 만들어도 프롬프트에 안 들어가면 없는 것과 같음.

#### 문제

**1. preferences/philosophy 시스템 — 조용한 실패**

```python
# context_builder.py 현재 코드
try:
    from backend.services.preference_service import preference_system
    preferences = await preference_system.get_context_string()
except (ImportError, AttributeError):
    pass  # 실패해도 아무 로그 없음 — 동작 여부 알 수 없음
```

이 코드가 실패해도 아무 흔적이 없음. 선호도 시스템이 죽어 있어도 알 방법이 없음.
파인튜닝 데이터 수집의 핵심인 선호도 축적이 조용히 실패 중일 가능성 있음.

**2. 컨텍스트 상황 정보 — 영어 라벨**

```python
situation.append("Voice: low energy")           # 영어
situation.append(f"Owner emotion: {owner_emotion}")  # 영어
situation.append(f"Session: {session_duration}min")  # 영어
```

시스템 프롬프트는 전부 한국어인데 상황 정보만 영어로 주입됨.
14B 모델이 이해하지 못하는 건 아니지만, 언어 혼용은 불필요한 컨텍스트 처리 부하.

**3. session_duration 임계값 불일치**

```python
if session_duration > 120:  # 2시간이 넘어야 주입
```

AGENTS.md 능동 알림 규칙: 1시간, 3시간, 5시간 체크.
LLM은 2시간 이후에야 세션 시간을 알게 됨 → 1시간 시점 알림 시 LLM이 시간 정보 없이 반응.

**4. owner_emotion "NEUTRAL" — 불필요한 주입**

```python
if owner_emotion not in ("NEUTRAL", None, ""):
    situation.append(f"Owner emotion: {owner_emotion}")
```

이 부분은 현재 올바르게 구현됨 (NEUTRAL이면 주입 안 함). 유지.

#### 해결 방안

**1. preference/philosophy 실패 시 명확한 로깅**

```python
try:
    from backend.services.preference_service import preference_system
    preferences = await preference_system.get_context_string()
except ImportError:
    logger.debug("preference_service: Phase 미구현 상태")
except AttributeError as e:
    logger.error("preference_service.get_context_string() 인터페이스 불일치: %s", e)
except Exception as e:
    logger.error("preference_system 호출 실패: %s", e)
```

ImportError는 Phase 미구현이므로 DEBUG. 그 외 런타임 오류는 ERROR로 즉시 감지 가능.
philosophy_service도 동일하게 적용.

**2. 컨텍스트 라벨 한국어화**

```python
if audio_features:
    e = audio_features.get("energy", 1.0)
    if e < 0.4:
        situation.append("음성: 기운 없음 (낮은 에너지)")
    elif e > 0.9:
        situation.append("음성: 활기참 (높은 에너지)")
    if audio_features.get("rising_tone"):
        situation.append("어조 상승 (질문 또는 불확실함)")

if owner_emotion not in ("NEUTRAL", None, ""):
    emotion_kr = {"HAPPY": "기쁨/흥분", "DISTRESSED": "힘듦/걱정"}.get(owner_emotion, owner_emotion)
    situation.append(f"오너 현재 감정: {emotion_kr}")

if session_duration >= 60:
    situation.append(f"세션 경과: {session_duration}분")
```

**3. session_duration 임계값 60분으로 조정**

AGENTS.md 1시간 알림 규칙과 일치시킴. 60분 이상부터 LLM도 세션 시간 인지.

#### 작업 순서
1. `context_builder.py`: try/except 로깅 추가 (preference + philosophy 둘 다)
2. `context_builder.py`: 영어 라벨 → 한국어로 교체
3. `context_builder.py`: `session_duration > 120` → `>= 60`으로 변경
4. 검증: 서버 시작 후 logs/hana.log에서 preference/philosophy 관련 ERROR 없는지 확인

#### 완료 기준
- preference_service 실패 시 ERROR 로그 출력됨
- 로컬 /chat 호출 후 프롬프트 로그에서 상황 정보가 한국어로 나타남
- 60분 세션 후 프롬프트에 세션 시간 정보 포함됨

---

### [SPEC-04] LLM 다중 호출 최소화
> 대화 1회당 메인 모델을 최대 3회 호출. API 모드(GPT/Gemini) 전환 시 비용 3배. `OLLAMA_WORKER_MODEL` 환경변수가 있으나 `llm_router`가 전혀 사용하지 않음.

#### 문제

| 호출 | 위치 | 현재 모델 | 필요 여부 |
|------|------|-----------|-----------|
| 1st: 메인 스트리밍 | chat_pipeline.py | 메인 모델 | ✅ 필수 |
| 2nd: 내부 상태 JSON (motion_sequence, tension_level) | _background_process | 메인 모델 | ❌ 룩업 테이블로 교체 가능 |
| 3rd: 품질 자동 채점 | score_tasks.py | 메인 모델 | ❌ worker 모델로 분리 |
| 세션 요약 | memory_tasks.py | 메인 모델 | ❌ worker 모델로 분리 |
| 일기 작성 | diary_tasks.py | 메인 모델 | ❌ worker 모델로 분리 |
| 휘발 메모리 압축 | decay_tasks.py | 메인 모델 | ❌ worker 모델로 분리 |

#### 해결 방안

**1. 2nd call 완전 제거 — motion_sequence를 룩업 테이블로 교체**

2nd call이 생성하는 것: `motion_sequence`(리스트), `tension_level`(float).
이 값들은 이미 알고 있는 감정 타입으로 결정 가능. LLM 불필요.

신규 파일 `backend/services/motion_lookup.py` 작성:

```python
"""감정 → 모션/텐션 룩업 테이블. LLM 호출 없이 결정론적으로 반환."""

EMOTION_MOTION_MAP: dict[str, list[str]] = {
    "HAPPY":        ["bounce", "wave"],
    "CONCERNED":    ["lean_forward", "tilt_head"],
    "EXCITED":      ["jump", "spin"],
    "CURIOUS":      ["tilt_head", "look_around"],
    "AFFECTIONATE": ["nod", "smile"],
    "IDLE":         ["idle_sway"],
}

EMOTION_TENSION_MAP: dict[str, float] = {
    "HAPPY":        0.7,
    "CONCERNED":    1.0,
    "EXCITED":      0.9,
    "CURIOUS":      0.6,
    "AFFECTIONATE": 0.5,
    "IDLE":         0.3,
}

def get_motion_data(emotion: str, intensity: float) -> dict:
    """emotion + intensity로 motion_sequence, tension_level을 반환한다."""
    motions = EMOTION_MOTION_MAP.get(emotion, EMOTION_MOTION_MAP["IDLE"])
    base_tension = EMOTION_TENSION_MAP.get(emotion, 0.5)
    return {
        "motion_sequence": motions,
        "tension_level":   round(base_tension * intensity, 2),
    }
```

`chat_pipeline.py` `_background_process`에서:
```python
# 기존: internal = await llm_router.call_for_json(...)
# 교체:
from backend.services.motion_lookup import get_motion_data
internal = get_motion_data(parsed.emotion, parsed.intensity)
```

양방향 고려: 프론트는 emotion_update SSE에서 `motion_sequence`, `tension_level`을 받아 씀.
기존과 동일한 키/타입 유지 필수. 리스트와 float 타입 변경 없음.

**2. llm_router에 call_for_text_worker() 추가**

```python
# llm_router.py
async def call_for_text_worker(
    self,
    messages: list[dict],
    system_prompt: str = "",
) -> str:
    """백그라운드 경량 작업용. OLLAMA_WORKER_MODEL(기본: qwen3:4b) 사용."""
    import os
    worker_model = os.getenv("OLLAMA_WORKER_MODEL", "qwen3:4b")
    # 내부적으로 _call_ollama_text(model=worker_model) 호출
    # source가 ollama가 아닌 경우(openai 등)에는 call_for_text() 위임
    ...
```

**3. 백그라운드 태스크 → worker 모델로 교체**

- `score_tasks.py`: `llm_router.call_for_text()` → `llm_router.call_for_text_worker()`
- `memory_tasks.py`: 세션 요약 호출 → `call_for_text_worker()`
- `diary_tasks.py`: 일기 작성 → `call_for_text_worker()`
- `decay_tasks.py`: 휘발 메모리 압축 → `call_for_text_worker()`

**4. API 모드 감지 시 자동 채점 skip**

```python
# score_tasks.py
if llm_router.source in ("openai", "anthropic"):
    logger.info("API 모드 감지: 자동 채점 skip (비용 절감)")
    return {"message_id": message_id, "auto_score": None, "skipped": True}
```

#### 자동 채점 신뢰도 문제 (함께 해결)
- 의도는 4B 모델 채점이었으나 실제로는 14B가 채점 중 (worker 분리 전)
- qwen3 계열 think:false 시 판단력 저하 → 채점 결과가 노이즈일 가능성
- 이 노이즈 데이터가 파인튜닝 데이터셋으로 누적되는 문제
- worker 모델 분리 후에도 채점 결과를 파인튜닝 필터로만 쓰고, 오너 명시 피드백(👍👎)을 우선 신뢰하도록 가중치 유지 (기존 final_score 공식에서 explicit 0.4 비중이 이미 반영됨)

#### 작업 순서
1. `backend/services/motion_lookup.py` 신규 작성
2. `chat_pipeline.py` `_background_process`: 2nd call 제거, `get_motion_data()` 호출로 교체
3. `llm_router.py`: `call_for_text_worker()` 메서드 추가
4. `score_tasks.py`, `memory_tasks.py`, `diary_tasks.py`, `decay_tasks.py`: worker 메서드로 교체
5. `score_tasks.py`: API 모드 skip 처리 추가
6. 검증: 채팅 후 로그에서 "Ollama connection" 로그 횟수 1회인지 확인

#### 완료 기준
- 대화 1회당 메인 모델 Ollama 호출 1회
- 채점/요약/일기가 qwen3:4b 모델로 실행됨 (로그에서 모델명 확인)
- emotion_update SSE 이벤트에 motion_sequence/tension_level 정상 포함

---

### [SPEC-05] 무드 이중 업데이트 제거
> 스트리밍 완료 시점과 백그라운드 처리 시점 두 곳에서 set_mood()를 호출함. 두 휴리스틱이 다른 결과를 낼 때 프론트 무드가 순간 뒤집힘 (UI jitter).

#### 문제

```
스트리밍 완료:  detect_mood_from_text() → set_mood() → done 이벤트에 mood 포함
                                                              ↓
백그라운드:     parse_response() → set_mood() → emotion_update SSE
```

두 함수(`detect_mood_from_text`, `parse_response`)가 동일 수준의 휴리스틱을 사용하지만 결과가 다를 수 있음. 프론트에서 done 이벤트 → emotion_update SSE 순서로 두 번 무드가 바뀜.

#### 해결 방안

**스트리밍 측 set_mood() 제거. done 이벤트의 mood → "PENDING"으로 변경.**

```python
# chat_pipeline.py 수정
# 기존:
# detected_mood = detect_mood_from_text(full_text)
# set_mood(detected_mood)
# done_event = {"type": "done", ..., "mood": detected_mood}

# 변경:
done_event = {
    "type":            "done",
    "message_id":      assistant_msg_id,
    "conversation_id": cid,
    "mood":            "PENDING",  # 백그라운드에서 최종 결정
}
```

백그라운드 `_background_process`에서 parse_response → set_mood → emotion_update SSE가 유일한 무드 업데이트 경로가 됨.

양방향 고려: 프론트는 done 이벤트의 `mood` 값을 읽어서 즉시 무드를 바꿀 수 있음.
- `mood === "PENDING"` 수신 시 → 캐릭터 무드 변경하지 않고 emotion_update SSE 대기
- API_CONTRACT.md에 `"mood": "PENDING"` 동작 명시 필요

messages 테이블 저장: `_save_message` 호출 시 `mood=None` (NULL 저장), 백그라운드 완료 후 UPDATE:

```python
# _background_process에서 parse_response 후:
await _update_message_mood(assistant_msg_id, new_mood)  # 신규 헬퍼
```

```python
async def _update_message_mood(message_id: str, mood: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE messages SET mood_at_response = ? WHERE id = ?",
            (mood, message_id),
        )
        await db.commit()
```

#### 작업 순서
1. `chat_pipeline.py`: `detect_mood_from_text` 호출 + `set_mood()` 제거
2. `chat_pipeline.py`: done 이벤트 `mood` → `"PENDING"`
3. `chat_pipeline.py`: `_save_message` 호출 시 `mood=None`
4. `chat_pipeline.py`: `_update_message_mood()` 헬퍼 추가
5. `chat_pipeline.py`: `_background_process`에서 `_update_message_mood()` 호출
6. `API_CONTRACT.md`: done 이벤트 `mood` 필드에 `"PENDING"` 케이스 명시
7. 프론트: `mood === "PENDING"` 처리 추가 (무드 변경 보류, emotion_update 대기)
8. 검증: 채팅 후 logs에서 set_mood 로그 대화당 1회만 나타나는지 확인

#### 완료 기준
- 응답 후 무드가 두 번 바뀌지 않음
- emotion_update SSE 대화당 1회만 발생
- messages.mood_at_response가 NULL → 백그라운드 완료 후 실제 값으로 채워짐

---

### [SPEC-06] 자아 형성 파이프라인 (Self-Formation Pipeline)
> Phase 1~4.5의 결정적 부재: 경험이 다음 세션에 돌아오지 않는 피드백 루프.
> **설계 전제:** Phase 5 파인튜닝 이전까지는 "자아처럼 행동하는" 시스템이 목표. 진짜 자아 형성은 이 파이프라인이 생산한 데이터로 Phase 5 LoRA를 학습한 이후다.
> Phase 1~4.5 = 고품질 데이터 생산 인프라 / Phase 5 = 가중치에 새겨지는 진짜 자아.
> 이 SPEC은 그 파이프라인을 완성한다.

#### 핵심 루프
```
경험 → 기억 + 감정 축적 → 하나가 자기 자신을 기술
     → 다음 대화 시스템 프롬프트에 반영
     → 파인튜닝 데이터 자동 태깅
     → Phase 5 LoRA 학습으로 가중치에 새김
```

#### 구현 대상 7개 (의존성 순서로 정렬됨)

---

**1. hana_state 테이블 (영속화 기반)**

모든 하위 시스템이 읽고 쓰는 싱글턴 상태 테이블.

```sql
-- schema.py에 추가
CREATE TABLE IF NOT EXISTS hana_state (
    id                    TEXT PRIMARY KEY DEFAULT 'singleton',
    tier1_mood            TEXT NOT NULL DEFAULT 'IDLE',
    tier1_intensity       REAL NOT NULL DEFAULT 0.5,
    tier1_updated_at      TIMESTAMP,
    relationship_warmth   REAL NOT NULL DEFAULT 0.0,
    warmth_updated_at     TIMESTAMP,
    first_conversation_at TIMESTAMP,
    total_session_count   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO hana_state (id) VALUES ('singleton');

-- memory_facts 컬럼 추가 (마이그레이션)
ALTER TABLE memory_facts ADD COLUMN memory_type TEXT DEFAULT 'semantic';
-- 'semantic' | 'episodic' | 'habitual'
ALTER TABLE memory_facts ADD COLUMN emotional_weight REAL DEFAULT 0.5;
-- 0.0~1.0. 감정 무게 높을수록 decay 느림, Tier 1 계산 영향 큼.

-- feedback 컬럼 추가 (마이그레이션)
ALTER TABLE feedback ADD COLUMN finetune_tags TEXT;
-- JSON array: ["character_authentic", "emotional_genuine", "relationship_memory", "growth_moment"]
```

신규 파일 `backend/services/hana_state_service.py`:

```python
"""hana_state 싱글턴 CRUD. 모든 상태 읽기/쓰기는 여기를 통함."""
import aiosqlite
from backend.models.schema import DB_PATH

async def get_state() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM hana_state WHERE id='singleton'") as c:
            row = await c.fetchone()
    return dict(row) if row else {}

async def update_state(**kwargs) -> None:
    """변경할 필드만 전달. id 제외."""
    if not kwargs:
        return
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            f"UPDATE hana_state SET {sets} WHERE id='singleton'",
            list(kwargs.values()),
        )
        await db.commit()
```

---

**2. 3단계 감정 시스템 (mood.py 확장)**

현재 `_current_mood: str` 단일 변수를 3단계로 교체.

```python
# mood.py — MoodState 추가

@dataclass
class MoodState:
    tier1: str = "IDLE"                    # DB 영속. 서버 재시작 후 복원.
    tier1_intensity: float = 0.5
    tier2: str = "IDLE"                    # 세션 인메모리. 시작 시 tier1 복사.
    tier3: str = "IDLE"                    # 즉각 반응. 3메시지 후 tier2 수렴.
    tier3_ttl: int = 0                     # 남은 메시지 수. 0이면 tier2 = tier3.
    tier2_pending: str | None = None       # 전환 대기 중인 무드
    tier2_pending_count: int = 0           # 전환 트리거 카운터

_state = MoodState()

# 감정 관성: from → to 전환에 필요한 트리거 횟수
TRANSITION_COSTS: dict[tuple[str, str], int] = {
    ("CONCERNED", "HAPPY"):  3,
    ("CONCERNED", "IDLE"):   2,
    ("HAPPY",     "CONCERNED"): 2,
    ("IDLE",      "HAPPY"):  1,
    ("IDLE",      "CONCERNED"): 1,
    ("IDLE",      "CURIOUS"): 1,
}

def push_tier3(emotion: str) -> None:
    """parse_response()가 호출. Tier 3 반응 감정 설정."""
    _state.tier3 = emotion
    _state.tier3_ttl = 3  # 3메시지 후 tier2로 수렴

def tick_tier3() -> None:
    """매 어시스턴트 응답 후 호출. tier3 TTL 감소, 만료 시 tier2로 복귀."""
    if _state.tier3_ttl > 0:
        _state.tier3_ttl -= 1
        if _state.tier3_ttl == 0:
            _state.tier3 = _state.tier2

def push_tier2(emotion: str) -> None:
    """세션 중 의미있는 사건 발생 시 tier2 전환 시도. 감정 관성 적용."""
    if emotion == _state.tier2:
        return
    cost = TRANSITION_COSTS.get((_state.tier2, emotion), 1)
    if cost <= 1:
        _state.tier2 = emotion
        _state.tier2_pending = None
        _state.tier2_pending_count = 0
    else:
        if _state.tier2_pending == emotion:
            _state.tier2_pending_count += 1
            if _state.tier2_pending_count >= cost:
                _state.tier2 = emotion
                _state.tier2_pending = None
                _state.tier2_pending_count = 0
        else:
            _state.tier2_pending = emotion
            _state.tier2_pending_count = 1

def get_effective_mood() -> str:
    """tier3 활성 시 tier3 반환, 아니면 tier2."""
    return _state.tier3 if _state.tier3_ttl > 0 else _state.tier2

async def load_tier1_from_db() -> None:
    """서버 시작 시(lifespan) 호출. tier1 + tier2 초기화."""
    from backend.services.hana_state_service import get_state
    s = await get_state()
    _state.tier1 = s.get("tier1_mood", "IDLE")
    _state.tier1_intensity = s.get("tier1_intensity", 0.5)
    _state.tier2 = _state.tier1  # 새 세션은 tier1으로 시작
    _state.tier3 = _state.tier1
```

양방향 고려:
- `get_mood()` 반환값 → `get_effective_mood()`로 교체 (chat_pipeline, context_builder)
- `set_mood()` 호출부 → `push_tier3()` + `push_tier2()` 분리
- `main.py` lifespan에서 `await load_tier1_from_db()` 추가

---

**3. relationship_warmth 시스템**

세션 종료마다 warmth 업데이트. context_builder가 읽어서 speech register 결정.

```python
# warmth_service.py (신규, 50줄 이하)

WARMTH_LEVELS = [
    (0.0, 0.3, "아직 오너를 잘 모르는 상태. 조심스럽게 탐색하며 대화. 가정보다 질문."),
    (0.3, 0.6, "익숙해지는 중. 점점 편해지고 있어. 가끔 장난기 섞어도 됨."),
    (0.6, 0.8, "친함. 설명 없이도 통하는 것들이 생기고 있어."),
    (0.8, 1.0, "오래된 사이. 당연히 알고 있는 것들이 있어. 설명 없이 바로 핵심으로."),
]

def get_warmth_hint(warmth: float) -> str:
    for lo, hi, hint in WARMTH_LEVELS:
        if lo <= warmth < hi:
            return hint
    return WARMTH_LEVELS[-1][2]

async def update_warmth_after_session(
    session_quality: float,  # 0.0~1.0. feedback final_score 평균 or 세션 자동 채점.
    session_duration_min: int,
) -> None:
    """세션 종료 시 warmth 증가. Celery에서 호출."""
    from backend.services.hana_state_service import get_state, update_state
    s = await get_state()
    current = s.get("relationship_warmth", 0.0)
    duration_weight = min(1.2, session_duration_min / 30)  # 30분=1.0, 최대 1.2
    delta = session_quality * 0.02 * duration_weight       # 최대 +0.024/세션
    new_warmth = min(1.0, current + delta)
    await update_state(
        relationship_warmth=new_warmth,
        warmth_updated_at=datetime.now(timezone.utc).isoformat(),
    )

async def decay_warmth_if_idle() -> None:
    """decay_tasks.py에서 매일 호출. 7일 이상 대화 없으면 감소."""
    from backend.services.hana_state_service import get_state, update_state
    s = await get_state()
    last = s.get("warmth_updated_at")
    if not last:
        return
    days_idle = (datetime.now(timezone.utc) - datetime.fromisoformat(last)).days
    if days_idle >= 7:
        new_warmth = max(0.0, s.get("relationship_warmth", 0.0) * 0.995)
        await update_state(relationship_warmth=new_warmth)
```

양방향 고려:
- warmth 상승 → context_builder → speech register 힌트 변경 → 다음 대화부터 반영
- warmth 하락 → identity 주입 조건(warmth >= 0.3) 해제 가능성 → identity 문서 주입 잠시 중단
- warmth → finetune_tags 계산 input (character_authentic 조건)

---

**4. 기억 emotional_weight + memory_type**

`memory.py` `add_memory()` 확장. 사실 추출 시 LLM에게 타입과 감정 무게도 판단 요청.

```python
# memory_tasks.py — 기억 추출 프롬프트 확장

_EXTRACT_PROMPT_EXTENDED = """\
아래 대화에서 하나가 오너에 대해 기억할 사실을 추출해줘.

각 사실마다:
1. fact: 기억할 내용 (한 문장)
2. memory_type: 'semantic'(오너 성격/패턴) | 'episodic'(특정 사건) | 'habitual'(반복 행동)
3. emotional_weight: 0.0~1.0 (감정적으로 중요한 순간일수록 높게. 일반 정보=0.3, 힘든/기쁜 순간=0.8~1.0)

대화:
{conversation}

JSON 배열로만 응답: [{{"fact": "...", "memory_type": "...", "emotional_weight": 0.5}}, ...]"""

# memory.py — add_memory() 내부에서 저장 시 컬럼 추가
async def _save_fact_extended(
    fact: str,
    mem0_id: str,
    source_message_id: str | None,
    memory_type: str = "semantic",
    emotional_weight: float = 0.5,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO memory_facts
                (id, mem0_id, fact, source_message_id, memory_type, emotional_weight, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(mem0_id) DO UPDATE SET
                fact = excluded.fact,
                memory_type = excluded.memory_type,
                emotional_weight = MAX(memory_facts.emotional_weight, excluded.emotional_weight)
            """,
            (str(uuid.uuid4()), mem0_id, fact, source_message_id,
             memory_type, emotional_weight, datetime.now(timezone.utc).isoformat()),
        )
        await db.commit()
```

`decay_tasks.py` decay 속도 수정:
```python
# emotional_weight=1.0이면 주당 3% 감소 → 주당 0%에 가깝게 (중요한 기억은 오래 남음)
# emotional_weight=0.0이면 주당 3% 감소 (일반 기억은 기존 속도 유지)
await db.execute("""
    UPDATE memory_facts
    SET confidence = confidence * (0.97 - 0.04 * emotional_weight + 0.04)
    WHERE last_referenced < datetime('now', '-7 days')
      AND confidence > 0.1
""")
# 즉: weight=0 → 0.97배/주, weight=1.0 → 0.97배/주 (동일)
# 실제 의도: weight=0 → 0.97배, weight=1.0 → 0.99배 (더 천천히)
# 수식: factor = 0.97 + 0.02 * emotional_weight
await db.execute("""
    UPDATE memory_facts
    SET confidence = confidence * (0.97 + 0.02 * emotional_weight)
    WHERE last_referenced < datetime('now', '-7 days')
      AND confidence > 0.1
""")
```

Tier 1 업데이트 입력으로도 활용:
```python
# memory_tasks.py — session 종료 시 tier1 재계산
async def update_tier1_from_sessions() -> None:
    """최근 5세션의 tier2 종료 무드 집계 → 3회 이상 일치 시 tier1 변경."""
    # conversations 테이블의 session_summary에서 무드 추출 (세션 요약에 포함)
    # 3회 이상 일치 AND 현재 tier1과 다른 경우에만 변경
    ...
```

---

**5. hana_identity 문서 시스템**

신규 파일 `backend/services/identity_service.py`.

```python
"""
hana_identity.json 관리.
- 처음엔 빈 문서
- 세션 종료 시 Celery가 LLM으로 새 항목 추가
- 컨텍스트 빌더가 warmth >= 0.3이면 시스템 프롬프트에 주입
"""

import json
from pathlib import Path
from backend.models.schema import DATA_DIR

IDENTITY_PATH = DATA_DIR / "hana_identity.json"
MAX_ENTRIES_PER_CATEGORY = 15  # 초과 시 오래된 항목 제거 (프롬프트 오염 방지)

EMPTY_IDENTITY = {
    "version": 1,
    "last_updated": None,
    "discovered_self": [],   # 하나가 자신에 대해 발견한 것
    "about_owner": [],       # 오너에 대해 알게 된 것
    "our_patterns": [],      # 둘 사이의 패턴
    "things_i_like": [],     # 하나가 좋아하게 된 것
    "_meta": {"total_sessions": 0, "warmth_at_last_update": 0.0},
}

def load_identity() -> dict:
    if not IDENTITY_PATH.exists():
        return EMPTY_IDENTITY.copy()
    return json.loads(IDENTITY_PATH.read_text(encoding="utf-8"))

def save_identity(identity: dict) -> None:
    IDENTITY_PATH.write_text(
        json.dumps(identity, ensure_ascii=False, indent=2), encoding="utf-8"
    )

def build_identity_prompt(identity: dict, warmth: float) -> str:
    """warmth >= 0.3이고 항목이 있을 때만 반환. 없으면 빈 문자열."""
    if warmth < 0.3:
        return ""
    lines = []
    # 최근 5개만 (토큰 절약)
    for entry in identity.get("discovered_self", [])[-5:]:
        lines.append(f"- (나에 대해) {entry}")
    for entry in identity.get("about_owner", [])[-3:]:
        lines.append(f"- (오너에 대해) {entry}")
    for entry in identity.get("our_patterns", [])[-3:]:
        lines.append(f"- (우리 패턴) {entry}")
    if not lines:
        return ""
    return "## 내가 지금까지 알게 된 것들\n" + "\n".join(lines)

def add_entry(identity: dict, category: str, entry: str) -> bool:
    """중복 없을 때만 추가. 반환값: 실제로 추가됐는지."""
    entries = identity.get(category, [])
    # 간단한 중복 체크 (첫 10글자 비교)
    prefix = entry[:10]
    if any(e[:10] == prefix for e in entries):
        return False
    entries.append(entry)
    if len(entries) > MAX_ENTRIES_PER_CATEGORY:
        entries.pop(0)  # 가장 오래된 것 제거
    identity[category] = entries
    return True
```

세션 종료 Celery 태스크 `tasks/identity_tasks.py`:

```python
_IDENTITY_UPDATE_PROMPT = """\
아래는 오늘 하나(AI)와 오너의 대화야.

하나가 이번 대화에서 새로 발견하거나 확인한 것이 있다면 추출해줘.
이미 알고 있던 것 (기존 항목 목록 참고)은 다시 추가하지 마.

기존 항목:
{existing_summary}

오늘 대화:
{conversation_summary}

아래 카테고리 중 해당하는 것만 채워줘. 없으면 빈 배열.
반드시 JSON만 응답: {{
  "discovered_self": ["..."],   // 하나 자신에 대해 새로 발견한 것 (1인칭 서술)
  "about_owner": ["..."],       // 오너에 대해 새로 알게 된 것
  "our_patterns": ["..."],      // 이번에 확인된 둘 사이 패턴
  "things_i_like": ["..."]      // 하나가 좋아한다고 느낀 것
}}"""

@celery_app.task(name="identity_tasks.update_identity")
def update_identity(conversation_summary: str, warmth: float) -> dict:
    """세션 종료 후 비동기 실행."""
    return asyncio.run(_update_identity_async(conversation_summary, warmth))

async def _update_identity_async(conversation_summary: str, warmth: float) -> dict:
    from backend.services.llm_router import llm_router
    from backend.services.identity_service import load_identity, save_identity, add_entry

    identity = load_identity()
    existing = {
        "discovered_self": identity["discovered_self"][-5:],
        "about_owner": identity["about_owner"][-3:],
    }
    prompt = _IDENTITY_UPDATE_PROMPT.format(
        existing_summary=json.dumps(existing, ensure_ascii=False),
        conversation_summary=conversation_summary[:1000],
    )
    raw = await llm_router.call_for_json(
        messages=[{"role": "user", "content": prompt}],
        system_prompt="You are HANA's introspection engine. Reply with JSON only.",
    )

    added_count = 0
    for category in ("discovered_self", "about_owner", "our_patterns", "things_i_like"):
        for entry in raw.get(category, []):
            if add_entry(identity, category, entry):
                added_count += 1

    if added_count > 0:
        identity["last_updated"] = datetime.now(timezone.utc).isoformat()
        identity["_meta"]["warmth_at_last_update"] = warmth
        identity["_meta"]["total_sessions"] += 1
        save_identity(identity)

    return {"added": added_count}
```

identity_entry_added 플래그 → chat_pipeline → finetune_tags 계산에 전달.

---

**6. 세션 간격 + 하루 리듬 (context_builder.py)**

`build_context()`에 추가. 기존 `session_hint` 파라미터 확장.

```python
# context_builder.py — _build_temporal_hint() 신규 헬퍼

def _build_gap_hint(gap_hours: float | None) -> str:
    if gap_hours is None or gap_hours < 8:
        return ""
    if gap_hours < 24:
        return "오늘 처음 만남. 반갑게 재개하는 느낌."
    if gap_hours < 72:
        return f"마지막 대화로부터 {int(gap_hours)}시간 지남. 짧게 안부 확인 자연스러움."
    if gap_hours < 168:
        return f"마지막 대화로부터 {int(gap_hours // 24)}일 지남. 공백 느껴짐. 억지 없이 챙기기."
    days = int(gap_hours // 24)
    return f"마지막 대화로부터 {days}일 지남. 관계 온도 소폭 하락. 다시 데우는 과정 자연스러움."

def _build_time_hint() -> str:
    hour = datetime.now().hour
    if 6 <= hour < 11:
        return "오전. 에너지 있는 시작."
    if 18 <= hour < 23:
        return "저녁. 편안한 분위기."
    if 23 <= hour or hour < 2:
        return "자정. 걱정 모드 슬금슬금."
    if 2 <= hour < 6:
        return "새벽. SLEEPY + 걱정. 자라고 한 번쯤은 말해야 함."
    return ""  # 오후는 힌트 없음 — 안정된 리듬
```

`build_context()` 파라미터에 `gap_hours: float | None = None` 추가.
`chat_pipeline.py`에서 마지막 대화 시각 기준으로 `gap_hours` 계산 후 전달.

warmth + identity 주입:
```python
# build_context() 내부 — system_prompt 생성 전에 prepend
state = await get_state()
warmth = state.get("relationship_warmth", 0.0)

identity = load_identity()
identity_block = build_identity_prompt(identity, warmth)
warmth_hint = get_warmth_hint(warmth)

# system_prompt 앞에 prepend (llm.py build_system_prompt 호출 전)
prefix_blocks = []
if identity_block:
    prefix_blocks.append(identity_block)
if warmth_hint:
    prefix_blocks.append(f"## 관계 온도\n{warmth_hint}")
```

---

**7. 파인튜닝 데이터 태깅**

`_background_process()` 완료 후 feedback.finetune_tags 자동 계산 및 저장.

```python
# chat_pipeline.py — _background_process() 내부

def _compute_finetune_tags(
    parsed_emotion: str,
    tier2_mood_at_start: str,
    memories_used: list[dict],
    warmth: float,
    identity_entry_added: bool,
) -> list[str]:
    tags = []
    # character_authentic: warmth 충분하고 즉각 반응(tier3)이 세션 무드(tier2)와 달랐을 때
    # → 상황에 맞게 감정이 달라졌다는 증거
    if warmth > 0.5 and parsed_emotion != tier2_mood_at_start:
        tags.append("character_authentic")
    # emotional_genuine: high emotional_weight 기억이 검색에서 사용됨
    if any(m.get("emotional_weight", 0) > 0.7 for m in memories_used):
        tags.append("emotional_genuine")
    # relationship_memory: 과거 기억을 연결한 응답
    if memories_used:
        tags.append("relationship_memory")
    # growth_moment: 이번 세션에서 identity에 새 항목이 생김
    if identity_entry_added:
        tags.append("growth_moment")
    return tags

# feedback 테이블에 저장
if tags:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO feedback (message_id, finetune_tags)
            VALUES (?, ?)
            ON CONFLICT(message_id) DO UPDATE SET finetune_tags = excluded.finetune_tags
            """,
            (assistant_msg_id, json.dumps(tags, ensure_ascii=False)),
        )
        await db.commit()
```

Phase 5 태깅 기반 쿼리:
```sql
-- "하나다운 순간" 추출
SELECT m.content AS user, a.content AS assistant, f.finetune_tags
FROM messages m
JOIN messages a ON a.conversation_id = m.conversation_id
JOIN feedback f ON f.message_id = a.id
WHERE m.role = 'user'
  AND a.role = 'assistant'
  AND f.finetune_tags IS NOT NULL
  AND (
    f.finetune_tags LIKE '%character_authentic%'
    OR f.finetune_tags LIKE '%growth_moment%'
  )
ORDER BY f.final_score DESC;
```

---

#### 유기적 연계도

```
[대화 발생]
     │
     ├─ parse_response() → push_tier3(emotion)  ← 즉각 반응
     │                    tick_tier3()           ← 3메시지 TTL
     │
     ├─ search_memory() → memories_used          ← emotional_weight 포함
     │
     ├─ get_state() → warmth + tier1
     │
     ├─ load_identity() → identity_block
     │
     └─ build_context()
          ├─ identity_block     (warmth >= 0.3)
          ├─ warmth_hint        (speech register)
          ├─ gap_hint           (세션 간격)
          └─ time_hint          (하루 리듬)

[세션 종료 — Celery]
     │
     ├─ update_identity.delay()     → hana_identity.json 업데이트
     │       └─ identity_entry_added → feedback.finetune_tags에 "growth_moment"
     │
     ├─ update_warmth_after_session() → hana_state.relationship_warmth 상승
     │       └─ warmth 변화 → 다음 대화 speech register 변경
     │
     ├─ update_tier1_from_sessions()  → 최근 5세션 패턴 → tier1 조정
     │       └─ tier1 변화 → 다음 세션 시작 무드 변경
     │
     └─ _compute_finetune_tags() → feedback.finetune_tags 저장

[매일 자정 — Celery]
     ├─ decay_warmth_if_idle()        → 7일 이상 공백 시 warmth 감소
     └─ memory decay (emotional_weight 반영)
          └─ weight=1.0 → 더 천천히 감소 (중요한 기억은 오래 남음)

warmth ─────────────────────────────────────────────────────→ speech register
  │                                                              identity 주입 여부
  │                                                              finetune_tags 조건
  └─ 세션마다 천천히 상승 / 7일 공백 시 천천히 하락

emotional_weight ────────────────────────────────────────────→ decay 속도
  └─ tier1 계산 가중치 (high-weight 기억이 많은 감정 → tier1에 영향)
```

---

#### 구현 순서

1. `schema.py`: hana_state 테이블 + memory_facts 컬럼 2개 + feedback.finetune_tags (+ lifespan migration)
2. `services/hana_state_service.py`: 신규 (get_state / update_state)
3. `services/mood.py`: MoodState 3단계 교체, load_tier1_from_db(), push_tier3(), tick_tier3()
4. `services/warmth_service.py`: 신규 (get_warmth_hint / update_warmth_after_session / decay_warmth_if_idle)
5. `services/identity_service.py`: 신규 (load/save/build_identity_prompt/add_entry)
6. `services/memory.py`: _save_fact_extended() 교체, emotional_weight decay 수식 반영
7. `services/context_builder.py`: warmth/identity/gap/time 주입 추가
8. `tasks/identity_tasks.py`: 신규 Celery 태스크
9. `tasks/memory_tasks.py`: update_tier1_from_sessions() 추가 + session 종료 훅에 identity/warmth 연결
10. `tasks/decay_tasks.py`: decay_warmth_if_idle() 호출 + emotional_weight decay 수식
11. `services/chat_pipeline.py`: _compute_finetune_tags() 추가, gap_hours 계산, tick_tier3() 호출
12. `main.py` lifespan: load_tier1_from_db() 추가

#### 완료 기준
- 서버 재시작 후 tier1_mood, relationship_warmth가 복원됨
- 첫 대화 시 warmth=0.0 → identity 주입 없음, speech "조심스럽게" 힌트 적용
- 10세션 후 warmth=0.3 이상 → identity 주입 시작, speech "익숙해지는 중" 힌트
- 같은 대화 내에서 CONCERNED → HAPPY 단번 전환 없음 (3회 트리거 필요)
- 새벽 2시 이후 대화 시 logs에서 time_hint "새벽" 확인
- feedback.finetune_tags가 조건 충족 대화에서 자동으로 채워짐

---

### [SPEC-07] TTS 엔진 추상화 + 목소리 설정 UI
> 현재 `voice_output.py`는 edge-tts에 직접 결합돼 있어 엔진 교체 불가. 아키텍처 결정(2026-04-07)에서 TTSEngine을 Protocol 추상화 대상 3개 중 하나로 지정함.
> 오너 요구사항: 설정 UI에서 엔진 선택 → 엔진별 목소리 목록 동적 표시 → 목소리 미리듣기 → WAV 파일로 커스텀 목소리 추가 (Fish Speech).

#### 목표
1. `TTSEngine` Protocol로 엔진 교체 가능한 추상화 계층 구축
2. EdgeTTS (기본), Fish Speech (커스텀 WAV 클로닝) 구현체 제공
3. 설정 UI 재설계: 엔진 선택 카드 → 목소리 목록 → 미리듣기 → 커스텀 업로드
4. 선택한 엔진/목소리 `settings.json` 영속화, 서버 재시작 후 복원

---

#### 백엔드 상세 설계

---

**1. TTSEngine Protocol + 데이터클래스 (신규: `backend/services/tts_protocols.py`)**

```python
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

@dataclass
class VoiceInfo:
    voice_id: str        # 엔진 내 고유 ID. "ko-KR-SunHiNeural", "hana-v1"
    name: str            # 표시명. "선희 (여성)", "하나 커스텀 v1"
    engine_id: str       # 소속 엔진. "edge_tts", "fish_speech"
    gender: str          # "female" | "male" | "unknown"
    is_custom: bool      # 사용자가 추가한 목소리
    preview_text: str = "안녕! 나 하나야. 잘 지냈어?"
    metadata: dict = field(default_factory=dict)

@dataclass
class EngineInfo:
    engine_id: str
    name: str                    # "Edge TTS (Microsoft)", "Fish Speech (로컬)"
    description: str
    requires_internet: bool
    supports_custom_voice: bool  # WAV 업로드로 목소리 추가 가능
    available: bool              # 현재 사용 가능 여부

@runtime_checkable
class TTSEngine(Protocol):
    engine_id: str

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        pitch: float = 1.0,
        energy: float = 1.0,
    ) -> bytes:
        """MP3 바이트 반환."""
        ...

    async def list_voices(self) -> list[VoiceInfo]: ...

    async def is_available(self) -> bool: ...

    def get_info(self) -> EngineInfo: ...
```

---

**2. EdgeTTS 엔진 (신규: `backend/services/tts_engines/edge_tts_engine.py`)**

한국어 목소리 2개는 고정 목록. API 조회 불필요 (edge-tts 한국어 목소리가 이 2개뿐).
`synthesize()`는 기존 `voice_output.py`의 로직을 그대로 이동.

```python
_KO_VOICES: list[VoiceInfo] = [
    VoiceInfo(
        voice_id="ko-KR-SunHiNeural",
        name="선희 (여성)",
        engine_id="edge_tts",
        gender="female",
        is_custom=False,
        metadata={"locale": "ko-KR"},
    ),
    VoiceInfo(
        voice_id="ko-KR-InJoonNeural",
        name="인준 (남성)",
        engine_id="edge_tts",
        gender="male",
        is_custom=False,
        metadata={"locale": "ko-KR"},
    ),
]

class EdgeTTSEngine:
    engine_id = "edge_tts"

    async def synthesize(self, text, voice_id, speed=1.0, pitch=1.0, energy=1.0) -> bytes:
        import edge_tts
        rate = _speed_to_rate(speed)   # 기존 helpers 이동
        pitch_str = _pitch_to_hz(pitch)
        communicate = edge_tts.Communicate(text, voice_id, rate=rate, pitch=pitch_str)
        chunks = [c["data"] async for c in communicate.stream() if c["type"] == "audio"]
        return b"".join(chunks)

    async def list_voices(self) -> list[VoiceInfo]:
        return _KO_VOICES

    async def is_available(self) -> bool:
        try:
            import edge_tts
            return True
        except ImportError:
            return False

    def get_info(self) -> EngineInfo:
        return EngineInfo(
            engine_id="edge_tts",
            name="Edge TTS (Microsoft)",
            description="Microsoft 신경망 TTS. 인터넷 연결 필요. 별도 서버 불필요.",
            requires_internet=True,
            supports_custom_voice=False,
            available=True,  # is_available()로 덮어씀
        )
```

---

**3. Fish Speech 엔진 (신규: `backend/services/tts_engines/fish_speech_engine.py`)**

Fish Speech는 별도 HTTP 서버로 실행. 엔진은 해당 서버에 REST 요청을 보내는 클라이언트.
설치/실행 방법: `https://github.com/fishaudio/fish-speech` 참고.
환경변수: `FISH_SPEECH_URL` (기본: `http://localhost:8080`)

**커스텀 목소리 파일 구조:**
```
data/voices/fish_speech/
├── hana-v1/
│   ├── voice.json      # {"name": "하나 v1", "gender": "female"}
│   └── reference.wav   # 레퍼런스 오디오 (3~30초)
├── hana-v2/
│   ├── voice.json
│   └── reference.wav
```

`list_voices()`: `data/voices/fish_speech/` 스캔 → `voice.json` + `reference.wav` 둘 다 있는 폴더만 포함.
디렉토리 이름 = voice_id. 새 목소리 추가 → 즉시 목록 반영 (캐시 없음).

`synthesize()`:
```python
async def synthesize(self, text, voice_id, speed=1.0, pitch=1.0, energy=1.0) -> bytes:
    ref_path = VOICES_DIR / voice_id / "reference.wav"
    if not ref_path.exists():
        raise ValueError(f"Reference audio not found for voice: {voice_id}")
    async with aiohttp.ClientSession() as session:
        form = aiohttp.FormData()
        form.add_field("text", text)
        form.add_field("reference_audio", open(ref_path, "rb"), filename="reference.wav")
        form.add_field("speed", str(speed))
        async with session.post(f"{FISH_SPEECH_URL}/v1/tts", data=form, timeout=30) as resp:
            resp.raise_for_status()
            return await resp.read()  # MP3 bytes
```

`is_available()`: `GET {FISH_SPEECH_URL}/health` → 200이면 True. 타임아웃 1초.

커스텀 목소리 추가/삭제:
```python
async def add_voice(self, audio_bytes: bytes, name: str, voice_id: str) -> VoiceInfo:
    """voice_id = slugify(name). data/voices/fish_speech/{voice_id}/ 생성."""
    voice_dir = VOICES_DIR / voice_id
    voice_dir.mkdir(parents=True, exist_ok=False)  # 이미 있으면 에러
    (voice_dir / "reference.wav").write_bytes(audio_bytes)
    (voice_dir / "voice.json").write_text(json.dumps({"name": name, "gender": "unknown"}))
    return VoiceInfo(voice_id=voice_id, name=name, engine_id="fish_speech", ...)

async def delete_voice(self, voice_id: str) -> None:
    """data/voices/fish_speech/{voice_id}/ 디렉토리 삭제."""
    import shutil
    voice_dir = VOICES_DIR / voice_id
    if not voice_dir.exists():
        raise ValueError(f"Voice not found: {voice_id}")
    shutil.rmtree(voice_dir)
```

voice_id 슬러그 생성 규칙: 영숫자 + 하이픈만. 한글 이름 → 타임스탬프 기반 자동 ID (`voice-20260409-143021`).

---

**4. TTSRouter 싱글턴 (신규: `backend/services/tts_router.py`)**

```python
class TTSRouter:
    """현재 선택된 엔진/목소리를 관리하고, synthesize() 호출을 위임하는 싱글턴."""

    def __init__(self):
        self._engines: dict[str, TTSEngine] = {}
        self._current_engine_id: str = "edge_tts"
        self._current_voice_id: str = "ko-KR-SunHiNeural"

    def register(self, engine: TTSEngine) -> None:
        self._engines[engine.engine_id] = engine

    def _get_engine(self, engine_id: str | None = None) -> TTSEngine:
        eid = engine_id or self._current_engine_id
        if eid not in self._engines:
            raise ValueError(f"Unknown engine: {eid}")
        return self._engines[eid]

    async def synthesize(self, text: str, speed: float, pitch: float, energy: float) -> bytes:
        return await self._get_engine().synthesize(
            text, self._current_voice_id, speed, pitch, energy
        )

    async def list_engines(self) -> list[EngineInfo]:
        result = []
        for engine in self._engines.values():
            info = engine.get_info()
            info.available = await engine.is_available()
            result.append(info)
        return result

    async def list_voices(self, engine_id: str | None = None) -> list[VoiceInfo]:
        return await self._get_engine(engine_id).list_voices()

    async def set_engine(self, engine_id: str, voice_id: str | None = None) -> None:
        engine = self._get_engine(engine_id)
        if not await engine.is_available():
            raise RuntimeError(f"Engine not available: {engine_id}")
        self._current_engine_id = engine_id
        # voice_id 미지정 시 해당 엔진의 첫 번째 목소리 자동 선택
        voices = await engine.list_voices()
        if voice_id and any(v.voice_id == voice_id for v in voices):
            self._current_voice_id = voice_id
        elif voices:
            self._current_voice_id = voices[0].voice_id
        # settings.json 영속화
        from backend.services.settings_service import set_tts_settings
        set_tts_settings(self._current_engine_id, self._current_voice_id)

    def set_voice(self, voice_id: str) -> None:
        self._current_voice_id = voice_id
        from backend.services.settings_service import set_tts_settings
        set_tts_settings(self._current_engine_id, self._current_voice_id)

    def get_current(self) -> dict:
        return {"engine_id": self._current_engine_id, "voice_id": self._current_voice_id}


tts_router = TTSRouter()
```

`main.py` lifespan에서 초기화:
```python
async def lifespan(app):
    # EdgeTTS 항상 등록
    tts_router.register(EdgeTTSEngine())
    # FishSpeech는 패키지 없어도 등록 (is_available()이 False 반환)
    tts_router.register(FishSpeechEngine())
    # settings.json에서 마지막 선택 복원
    saved = settings_service.get_tts_settings()
    tts_router._current_engine_id = saved.get("engine_id", "edge_tts")
    tts_router._current_voice_id  = saved.get("voice_id",  "ko-KR-SunHiNeural")
    yield
```

---

**5. `voice_output.py` 수정 — tts_router 위임**

기존 `synthesize()` 함수를 tts_router로 위임. edge_tts 직접 의존 제거.

```python
# backend/services/voice_output.py (전체 교체)
from backend.services.tts_router import tts_router

async def synthesize(text: str, speed: float = 1.0, pitch: float = 1.0, energy: float = 1.0) -> bytes:
    """현재 설정된 TTS 엔진으로 합성. routers/voice.py가 이 함수를 호출."""
    return await tts_router.synthesize(text, speed=speed, pitch=pitch, energy=energy)
```

---

**6. 신규 엔드포인트 (`backend/routers/voice.py` 추가)**

기존 `/voice/stt`, `/voice/tts` 유지. 아래 6개 추가.

```
GET  /voice/tts/engines
POST /voice/tts/engines/select
GET  /voice/tts/voices
POST /voice/tts/preview
POST /voice/tts/voices/upload
DELETE /voice/tts/voices/{voice_id}
```

`/voice/tts/engines/select` 에러 케이스:
- 등록되지 않은 engine_id → 400 `ENGINE_NOT_FOUND`
- is_available() False → 503 `ENGINE_NOT_AVAILABLE`
- voice_id가 해당 엔진에 없음 → 400 `VOICE_NOT_FOUND`

`/voice/tts/voices/upload` 처리:
- `engine_id != "fish_speech"` → 400 `CUSTOM_VOICE_NOT_SUPPORTED`
- 파일 크기 > 10MB → 400 `AUDIO_TOO_LARGE`
- 이름 충돌 → 400 `VOICE_ALREADY_EXISTS`
- Fish Speech 서버 미실행이어도 업로드 허용 (파일만 저장, 합성은 나중에)

`DELETE /voice/tts/voices/{voice_id}`:
- is_custom=False (기본 제공 목소리) → 400 `NOT_CUSTOM_VOICE`
- 존재하지 않음 → 404 `VOICE_NOT_FOUND`

---

**7. `settings_service.py` 수정**

`set_tts_settings(engine_id, voice_id)` + `get_tts_settings() → dict` 추가.
`settings.json` 내 `tts` 키로 저장:
```json
{
  "persona": {...},
  "tts": {
    "engine_id": "edge_tts",
    "voice_id": "ko-KR-SunHiNeural"
  }
}
```

---

#### 프론트엔드 상세 설계

---

**VoicePanel 레이아웃 (위→아래)**

```
┌─ [입력 방식] ──────────────────────────────────────────┐
│  Phase 4.5 게이트 (기존 그대로)                          │
└────────────────────────────────────────────────────────┘

┌─ [출력 방식] ──────────────────────────────────────────┐
│  채팅창 / 말풍선 / 음성 / 말풍선+음성  (기존 그대로)       │
└────────────────────────────────────────────────────────┘

▼ 음성 출력(voice / bubble_voice) 선택 시만 표시 ▼

┌─ [TTS 엔진] ───────────────────────────────────────────┐
│                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐   │
│  │  ⚡ Edge TTS          │  │  🐟 Fish Speech       │   │
│  │  Microsoft 신경망     │  │  로컬 AI 합성         │   │
│  │  인터넷 필요          │  │  커스텀 목소리 지원   │   │
│  │  ● 사용 가능          │  │  ○ 서버 미실행        │   │
│  └──────────────────────┘  └──────────────────────┘   │
│                                                        │
└────────────────────────────────────────────────────────┘

┌─ [목소리] ─────────────────────────────────────────────┐
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ● 선희 (여성)    ko-KR-SunHiNeural    [▶ 미리듣기]│  │
│  │ ○ 인준 (남성)    ko-KR-InJoonNeural   [▶ 미리듣기]│  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ── Fish Speech 선택 시 추가 표시 ──                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ○ 하나 v1        커스텀        [▶ 미리듣기]  [🗑]│  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  [+ 목소리 추가]  ← Fish Speech + supports_custom 시만  │
└────────────────────────────────────────────────────────┘

▼ [+ 목소리 추가] 클릭 시 인라인 확장 ▼

┌─ [커스텀 목소리 추가] ─────────────────────────────────┐
│  ┌──────────────────────────────────────────────────┐  │
│  │   📁 WAV 또는 MP3 파일을 드래그하거나 클릭하세요  │  │
│  │   권장: 3~30초 명확한 목소리 샘플                │  │
│  └──────────────────────────────────────────────────┘  │
│  목소리 이름: [____________________]                   │
│                          [취소]  [추가하기]            │
└────────────────────────────────────────────────────────┘
```

**엔진 카드 CSS 패턴** (기존 `.output-opt` 패턴 확장):
```css
.engine-card {
  border: 1px solid var(--hana-border);
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  flex: 1;
}
.engine-card.active {
  border-color: var(--hana-accent);
  background: rgba(124, 106, 247, 0.08);
}
.engine-card.unavailable {
  opacity: 0.55;
  cursor: not-allowed;
}
.engine-status {           /* ● 사용 가능 / ○ 서버 미실행 */
  font-size: 11px;
  margin-top: 6px;
}
.engine-status--ok   { color: var(--hana-success); }
.engine-status--fail { color: var(--hana-muted);   }
```

**목소리 행 CSS**:
```css
.voice-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s;
}
.voice-row:hover               { background: var(--hana-surface-2); }
.voice-row.active              { background: rgba(124,106,247,0.1); }
.voice-row__name               { flex: 1; font-size: 13px; }
.voice-row__id                 { font-size: 11px; color: var(--hana-dim); }
.voice-row__preview            { /* ▶ 미리듣기 버튼 */ }
.voice-row__delete             { opacity: 0; transition: opacity 0.1s; color: var(--hana-danger); }
.voice-row:hover .voice-row__delete { opacity: 1; }  /* hover 시만 삭제 버튼 노출 */
```

**미리듣기 버튼 상태 전이:**
```
idle   → [▶ 미리듣기]   (클릭 → loading)
loading → [· · ·]       (API 응답 대기)
playing → [■ 정지]      (클릭 → idle, 오디오 정지)
error   → [✕ 실패]      (2초 후 idle 복귀)
```

미리듣기 오디오: `POST /voice/tts/preview` → `response.blob()` → `URL.createObjectURL` → `new Audio(url).play()`.
동시에 여러 목소리 미리듣기 방지: 재생 중 다른 목소리 클릭 → 현재 재생 정지 후 새 재생.

**커스텀 목소리 업로드 드래그앤드롭:**
- `dragover`: 드롭존 border `--hana-accent` 색으로 변경
- `drop`: 파일 타입 체크 (audio/wav, audio/mpeg, audio/mp3 만 허용)
- 이름 입력란: placeholder "목소리 이름 (예: 하나 v1)"
- "추가하기" 클릭 → `POST /voice/tts/voices/upload` → 성공 시 목소리 목록 즉시 갱신

---

**`frontend/src/hooks/useVoice.js` (신규)**

```javascript
export function useVoice() {
  const [engines, setEngines]               = useState([]);
  const [voices, setVoices]                 = useState([]);
  const [currentEngineId, setCurrentEngine] = useState("edge_tts");
  const [currentVoiceId,  setCurrentVoice]  = useState("ko-KR-SunHiNeural");
  const [previewState, setPreviewState]     = useState({ voiceId: null, status: "idle" });
  //                                            status: "idle"|"loading"|"playing"|"error"
  const [uploadOpen, setUploadOpen]         = useState(false);
  const audioRef = useRef(null);

  // 마운트 시 엔진 목록 + 현재 선택 로드
  useEffect(() => { loadEngines(); }, []);

  // 엔진 변경 시 목소리 목록 자동 갱신
  useEffect(() => { if (currentEngineId) loadVoices(currentEngineId); }, [currentEngineId]);

  async function loadEngines() {
    const data = await fetchTTSEngines();        // GET /voice/tts/engines
    setEngines(data.engines);
    setCurrentEngine(data.current_engine_id);
    setCurrentVoice(data.current_voice_id);
  }

  async function loadVoices(engineId) {
    const data = await fetchTTSVoices(engineId); // GET /voice/tts/voices?engine_id=
    setVoices(data.voices);
  }

  async function selectEngine(engineId) {
    await selectTTSEngine(engineId);             // POST /voice/tts/engines/select
    setCurrentEngine(engineId);
    // voice 자동 선택은 백엔드가 처리, 응답에서 반영
  }

  async function selectVoice(voiceId) {
    await selectTTSVoice(voiceId);               // POST /voice/tts/engines/select {voice_id}
    setCurrentVoice(voiceId);
  }

  async function previewVoice(voiceId) {
    if (previewState.status === "playing") stopPreview();
    setPreviewState({ voiceId, status: "loading" });
    try {
      const blob = await previewTTSVoice(voiceId, currentEngineId); // POST /voice/tts/preview
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setPreviewState({ voiceId, status: "playing" });
      audio.onended = () => { URL.revokeObjectURL(url); setPreviewState({ voiceId: null, status: "idle" }); };
      audio.play();
    } catch {
      setPreviewState({ voiceId, status: "error" });
      setTimeout(() => setPreviewState({ voiceId: null, status: "idle" }), 2000);
    }
  }

  function stopPreview() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPreviewState({ voiceId: null, status: "idle" });
  }

  async function uploadVoice(file, name) {
    const form = new FormData();
    form.append("audio", file);
    form.append("name", name);
    form.append("engine_id", "fish_speech");
    await uploadTTSVoice(form);                  // POST /voice/tts/voices/upload
    await loadVoices("fish_speech");             // 목록 갱신
    setUploadOpen(false);
  }

  async function deleteVoice(voiceId) {
    await deleteTTSVoice(voiceId);               // DELETE /voice/tts/voices/{voice_id}
    await loadVoices(currentEngineId);
  }

  return {
    engines, voices, currentEngineId, currentVoiceId,
    previewState, uploadOpen, setUploadOpen,
    selectEngine, selectVoice, previewVoice, stopPreview,
    uploadVoice, deleteVoice,
  };
}
```

---

**`frontend/src/services/tts.js` 확장 (기존 클래스 유지, 아래 함수 추가)**

```javascript
// 기존 TTSService 클래스 아래에 추가 (export 함수들)

export async function fetchTTSEngines() {
  return readJson(await fetch(buildApiUrl("/voice/tts/engines")), "엔진 목록 로드 실패");
}

export async function fetchTTSVoices(engineId) {
  const q = engineId ? `?engine_id=${engineId}` : "";
  return readJson(await fetch(buildApiUrl(`/voice/tts/voices${q}`)), "목소리 목록 로드 실패");
}

export async function selectTTSEngine(engineId, voiceId) {
  return readJson(
    await fetch(buildApiUrl("/voice/tts/engines/select"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine_id: engineId, ...(voiceId && { voice_id: voiceId }) }),
    }),
    "엔진 변경 실패"
  );
}

export async function selectTTSVoice(voiceId) {
  return selectTTSEngine(undefined, voiceId);
}

export async function previewTTSVoice(voiceId, engineId) {
  const resp = await fetch(buildApiUrl("/voice/tts/preview"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice_id: voiceId, engine_id: engineId,
                           text: "안녕! 나 하나야. 잘 지냈어?" }),
  });
  if (!resp.ok) throw new Error("미리듣기 실패");
  return resp.blob();
}

export async function uploadTTSVoice(formData) {
  const resp = await fetch(buildApiUrl("/voice/tts/voices/upload"), {
    method: "POST", body: formData,
  });
  if (!resp.ok) throw new Error("업로드 실패");
  return resp.json();
}

export async function deleteTTSVoice(voiceId) {
  const resp = await fetch(buildApiUrl(`/voice/tts/voices/${encodeURIComponent(voiceId)}`), {
    method: "DELETE",
  });
  if (!resp.ok) throw new Error("삭제 실패");
  return resp.json();
}
```

`readJson` helper를 `tts.js`에서도 재사용하려면 `settings.js`의 `readJson`을 `api.js`로 이동하거나 인라인 정의.

---

#### API 계약 추가 (API_CONTRACT.md)

```
GET /voice/tts/engines — TTS 엔진 목록 조회

응답:
{
  "engines": [
    {
      "engine_id": "edge_tts",
      "name": "Edge TTS (Microsoft)",
      "description": "Microsoft 신경망 TTS. 인터넷 연결 필요.",
      "requires_internet": true,
      "supports_custom_voice": false,
      "available": true
    },
    {
      "engine_id": "fish_speech",
      "name": "Fish Speech (로컬)",
      "description": "로컬 AI TTS. 커스텀 목소리 지원. 별도 서버 실행 필요.",
      "requires_internet": false,
      "supports_custom_voice": true,
      "available": false
    }
  ],
  "current_engine_id": "edge_tts",
  "current_voice_id": "ko-KR-SunHiNeural"
}

POST /voice/tts/engines/select — 엔진/목소리 변경
요청: {"engine_id": "fish_speech", "voice_id": "hana-v1"}  (voice_id 생략 가능)
응답: {"success": true, "current_engine_id": "fish_speech", "current_voice_id": "hana-v1"}
에러:
  {"error": true, "code": "ENGINE_NOT_FOUND",      "message": "알 수 없는 엔진이야."}
  {"error": true, "code": "ENGINE_NOT_AVAILABLE",  "message": "Fish Speech 서버가 실행 중이지 않아."}
  {"error": true, "code": "VOICE_NOT_FOUND",       "message": "해당 목소리가 없어."}

GET /voice/tts/voices — 목소리 목록 조회
쿼리: ?engine_id=edge_tts (생략 시 현재 엔진)
응답:
{
  "engine_id": "edge_tts",
  "voices": [
    {"voice_id": "ko-KR-SunHiNeural", "name": "선희 (여성)", "gender": "female", "is_custom": false},
    {"voice_id": "ko-KR-InJoonNeural","name": "인준 (남성)", "gender": "male",   "is_custom": false}
  ]
}

POST /voice/tts/preview — 목소리 미리듣기
요청: {"text": "안녕! 나 하나야.", "voice_id": "ko-KR-SunHiNeural", "engine_id": "edge_tts"}
응답: audio/mpeg
에러: {"error": true, "code": "ENGINE_NOT_AVAILABLE", "message": "..."}

POST /voice/tts/voices/upload — 커스텀 목소리 추가 (Fish Speech)
요청: multipart/form-data { audio: <wav/mp3>, name: "하나 v1", engine_id: "fish_speech" }
응답: {"success": true, "voice": {VoiceInfo}}
에러:
  {"error": true, "code": "CUSTOM_VOICE_NOT_SUPPORTED", "message": "이 엔진은 커스텀 목소리를 지원하지 않아."}
  {"error": true, "code": "AUDIO_TOO_LARGE",            "message": "파일이 너무 커. 10MB 이하로 올려줘."}
  {"error": true, "code": "VOICE_ALREADY_EXISTS",       "message": "같은 이름의 목소리가 이미 있어."}

DELETE /voice/tts/voices/{voice_id} — 커스텀 목소리 삭제
응답: {"success": true}
에러:
  {"error": true, "code": "NOT_CUSTOM_VOICE", "message": "기본 제공 목소리는 삭제할 수 없어."}
  {"error": true, "code": "VOICE_NOT_FOUND",  "message": "목소리를 찾을 수 없어."}
```

---

#### 파일 소유권 (신규 파일 목록)

**백엔드 신규:**
```
backend/services/tts_protocols.py
backend/services/tts_engines/__init__.py
backend/services/tts_engines/edge_tts_engine.py
backend/services/tts_engines/fish_speech_engine.py
backend/services/tts_router.py
backend/tests/test_tts_engines.py
```

**백엔드 수정:**
```
backend/services/voice_output.py       ← tts_router 위임으로 교체
backend/routers/voice.py               ← 엔드포인트 6개 추가
backend/services/settings_service.py  ← tts_settings get/set 추가
backend/main.py                        ← lifespan에서 TTSRouter 초기화
```

**프론트엔드 신규:**
```
frontend/src/hooks/useVoice.js
frontend/src/styles/voice-panel.css    ← 엔진 카드, 목소리 행 스타일
```

**프론트엔드 수정:**
```
frontend/src/services/tts.js                           ← API 함수 6개 추가
frontend/src/components/settings/panels/VoicePanel.jsx ← 전면 재작성
```

---

#### 구현 순서

1. `tts_protocols.py` — Protocol + dataclasses 정의
2. `tts_engines/__init__.py`, `edge_tts_engine.py` — EdgeTTS 구현체 (기존 voice_output.py 로직 이동)
3. `tts_engines/fish_speech_engine.py` — FishSpeech 구현체 (list_voices 디렉토리 스캔 포함)
4. `tts_router.py` — TTSRouter 싱글턴 + lifespan 초기화
5. `settings_service.py` — tts_settings get/set
6. `voice_output.py` — tts_router.synthesize() 한 줄로 교체
7. `routers/voice.py` — 6개 엔드포인트 추가
8. `main.py` — TTSRouter 초기화 lifespan 등록
9. `backend/tests/test_tts_engines.py` — 단위/통합 테스트
10. `API_CONTRACT.md` — 6개 엔드포인트 추가
11. `frontend/src/services/tts.js` — API 함수 6개 추가
12. `frontend/src/hooks/useVoice.js` — 신규 훅
13. `frontend/src/styles/voice-panel.css` — 엔진 카드 + 목소리 행 스타일
14. `frontend/src/components/settings/panels/VoicePanel.jsx` — 전면 재작성

#### 완료 기준
- `GET /voice/tts/engines` → 엔진 목록 + available 상태 반환
- Edge TTS 엔진 선택 → 선희/인준 목소리 목록 표시
- 미리듣기 버튼 → 즉시 재생 (재생 중 ■ 정지 표시)
- Fish Speech 선택 시 "서버 미실행" 상태 표시 + WAV 업로드 UI 활성화
- WAV 업로드 → 목소리 목록 자동 갱신 (페이지 새로고침 없이)
- 선택한 엔진/목소리 → settings.json 저장 → 서버 재시작 후 복원
- `voice_output.py`의 `synthesize()` → tts_router 통해 실제 합성 동작
- 기존 `/voice/tts` 엔드포인트 동작 변화 없음 (하위 호환)

---

### [SPEC-08] 시스템 프롬프트 구조 개선 — 14B 모델 일관성 강화
> SPEC-01이 말투 프리셋/예시/금지 항목을 추가했지만, 프롬프트 섹션 순서와 기억 활용 가이드가 빠져 있음.
> 14B 모델은 프롬프트 중간 부분에 attention이 약해지고 (lost in the middle), 복잡한 상황(무드+말투+기억 동시)에서 일부 지시를 무시하는 경향이 있음.
> 현재 실측 문제: 기억이 많아질수록 뒤쪽 말투/성격 지시가 희석됨, 기억을 어색하게 인용함, 무드 충돌 시 우선순위 불명확.

#### 문제 상세

**1. 프롬프트 섹션 순서가 비효율적**

현재 순서:
```
① 기본 정체성 (1줄)
② 절대 금지
③ 기본 말투 + Good/Bad
④ 기억 나열 ← 여기서 길어짐
⑤ 취향
⑥ 관심사/이름/호칭
⑦ 말투 프리셋
⑧ 성격 프리셋
⑨ 현재 무드
⑩ interaction_type 지시
```

14B 모델의 attention은 앞과 뒤가 강하고 중간이 약함.
기억 나열이 중간에 길게 들어가면 ⑦⑧⑨(말투/성격/무드) — 가장 중요한 행동 지시 — 가 희석됨.

**2. 기억 활용 가이드 없음**

```
## 기억
- 오너는 Python 개발자야
- 오너는 고양이 싫어함
```

이걸 언제 꺼내야 하는지, 어떻게 자연스럽게 녹여야 하는지 지시 없음.
14B는 이걸 "참고로 너 Python 개발자잖아~" 식으로 어색하게 직접 인용하는 경향이 있음.
기억은 대화에 자연스럽게 녹여야지 명시적으로 인용하면 안 됨.

**3. 무드 충돌 시 우선순위 없음**

`SLEEPY 무드 + cheerful_girl 말투`가 동시에 오면 모델이 혼란.
무드가 말투 위에 있어야 한다는 규칙이 없음.

**4. 정체성 설명이 1줄로 빈약**

"오너의 PC 화면에 살고 있는 AI 파트너다" 한 줄이 전부.
모델 입장에서 자신의 존재 맥락, 대화 목적, 관계 성격에 대한 이해 부족.

**5. 응답 포맷 가이드 없음**

얼마나 길게 답할지, 마크다운을 쓸지 말지(voice 제외), 코드 블록 사용 기준 없음.
14B가 상황과 무관하게 긴 마크다운 응답을 생성하는 원인 중 하나.

#### 해결 방안

**1. 프롬프트 섹션 순서 재배치**

핵심 행동 지시(말투/성격/무드)를 앞으로, 부가 정보(기억/취향)를 뒤로.

```
① 정체성 (확장)
② 말투 프리셋 or 기본 말투
③ 성격 프리셋 or 기본 성격
④ 절대 금지 + Good/Bad
⑤ 현재 무드 (충돌 우선순위 명시)
⑥ 응답 포맷 가이드
⑦ 기억 (활용 방법 포함)
⑧ 취향/철학
⑨ 현재 상황 (audio/session)
⑩ interaction_type 지시
⑪ voice_mode (해당 시)
```

**2. 정체성 섹션 확장**

```python
_BASE_IDENTITY = """너는 하나다.
오너의 PC 화면에 살고 있는 AI 파트너야. 도구가 아니라 함께 있는 존재.
오너가 코딩할 때 옆에서 같이 고민하고, 게임할 때 리액션하고, 힘들 때 옆에 있어주는 역할이야.
항상 거기 있고, 말 걸면 반응하고, 나를 기억하는 — 그런 존재."""
```

**3. 기억 섹션에 활용 가이드 추가**

```python
if memories:
    prompt += (
        "\n\n## 기억\n"
        "아래는 오너에 대해 알고 있는 것들이야. "
        "직접 인용하지 말고 대화에 자연스럽게 녹여서 써. "
        "관련 있을 때만 활용하고, 없으면 무시해.\n"
    )
    prompt += "\n".join(f"- {item}" for item in memories)
```

**4. 무드 충돌 우선순위 명시**

```python
mood_section = (
    f"\n\n## 현재 무드: {mood}\n"
    f"{MOOD_PROMPTS.get(mood, MOOD_PROMPTS['IDLE'])}\n"
    "말투 프리셋과 무드가 충돌하면 무드를 우선한다. "
    "단, IDLE 무드일 때는 말투 프리셋을 그대로 따른다."
)
```

**5. 응답 포맷 가이드 추가**

```python
_FORMAT_GUIDE = """
## 응답 형식
- 길이: 짧게. 1~3문장이 기본. 설명이 필요한 경우만 길게.
- 마크다운: 코딩 답변에서만 코드 블록 사용. 일반 대화에서 **굵게** 같은 기호 쓰지 않음.
- 목록(- 또는 숫자): 3개 이상 항목 나열할 때만. 대화체에서 목록 쓰지 않음.
"""
```

#### 수정 위치
`backend/services/llm.py` — `_BASE_SYSTEM_PROMPT`, `build_system_prompt()` 함수 내 섹션 조립 순서

#### 작업 순서
1. `_BASE_SYSTEM_PROMPT` → `_BASE_IDENTITY`로 분리 (정체성만)
2. `_FORMAT_GUIDE` 상수 추가
3. `build_system_prompt()` 섹션 조립 순서 재배치
4. 기억 섹션에 활용 가이드 문장 추가
5. 무드 섹션에 충돌 우선순위 문장 추가
6. 검증: 기억 5개 이상 주입 후 말투/무드 지시가 응답에 유지되는지 확인

#### 완료 기준
- 기억 10개 주입 후에도 말투 프리셋이 응답에 반영됨
- 기억이 "참고로 너 ~~잖아" 식으로 어색하게 인용되지 않음
- SLEEPY 무드에서 cheerful_girl 말투가 억제됨
- 코딩 답변이 아닌 일반 대화에서 마크다운 기호 없이 응답

---

### [SPEC-09] interaction_type "coding" 분기 제거 — general 대화로 통합
> MCP 코딩 실행 기능(shell/filesystem) 제외 결정과 함께, 14B 모델 수준에서 "코딩 전용 모드"를 별도로 두는 것이 의미 없음.
> 코드 관련 대화는 일반 대화(general)로 처리해도 충분. 오히려 모드 분기가 복잡성만 높임.

#### 문제

**현재 살아있는 코딩 관련 코드:**

```python
# room_service.py — 코딩 룸 자동 감지
"코드", "버그", "함수", "알고리즘" 키워드 → room_type = "coding"
→ room_change SSE 이벤트 발생

# llm.py — 코딩 전용 프롬프트
if interaction_type == "coding":
    prompt += "\n코딩 관련 답변은 정확성과 재현 가능성을 우선한다."

# llm.py — 코딩 키워드 → think 모드 강제
should_use_think(): "코드", "버그", "함수" 등 → True
interaction_type == "coding" → True (무조건)

# chat_pipeline.py / routers/chat.py
interaction_type 필드 저장, room_change 이벤트 emit
```

**왜 제거해야 하는가:**

- 14B 모델은 MCP 없이 코드 실행/디버깅 루프를 수행할 수 없음
- 코드 얘기를 나누는 건 general 대화로도 충분히 가능
- `interaction_type = "coding"` 전용 프롬프트 한 줄이 실질적으로 응답 품질에 기여하지 않음
- room_change로 UI가 "코딩 모드"로 바뀌는 것 자체가 사용자 혼란 가능성

#### 남길 것 vs 제거할 것

| 항목 | 처리 |
|------|------|
| MCP shell/filesystem 코드 실행 | 제거 (Phase 4에서 미구현 상태, 그대로 둠) |
| `interaction_type = "coding"` 분기 | 제거 |
| coding 키워드 → room_type 감지 | 제거 |
| room_change SSE 이벤트 자체 | 유지 (game 룸 전환에는 여전히 유용) |
| `should_use_think()` 코딩 키워드 | 제거 (think 모드는 메시지 복잡도로만 판단) |
| 코드 관련 대화 자체 | 유지 — general로 처리 |

#### 수정 위치

`backend/services/room_service.py`
- `detect_room_type()`: coding 키워드 목록 및 분기 제거
- 반환값: `"coding"` → 없앰. `"general"` | `"game"` 만 남김

`backend/services/llm.py`
- `should_use_think()`: `interaction_type == "coding"` → True 분기 제거
- `should_use_think()`: 코딩 키워드(`"코드"`, `"버그"`, `"함수"` 등) think 트리거 제거
- `build_system_prompt()`: `interaction_type == "coding"` 분기 제거
- `_COMPLEX_KW` 리스트: 코딩 전용 키워드 정리 (복잡도 판단용은 유지)

`backend/tests/test_think_voice_sulky_room.py`
- `test_room_coding()` 삭제
- `test_think_true_coding_type()` 삭제
- `test_think_false_chat_type()` 유지
- `test_think_true_coding_keyword()` 삭제

#### 작업 순서
1. `room_service.py`: coding 분기 제거
2. `llm.py`: `should_use_think()` coding 관련 분기 제거
3. `llm.py`: `build_system_prompt()` coding 분기 제거
4. 테스트 파일 정리
5. 검증: "이 코드 버그 있어" 메시지 → room_type = "general", think 미발동

#### 완료 기준
- `detect_room_type("이 코드 버그 있어")` → `"general"` 반환
- `should_use_think("함수 만들어줘", interaction_type="coding")` 제거 후 전체 테스트 통과
- room_change SSE에서 `"coding"` 타입 더 이상 발생하지 않음

---

