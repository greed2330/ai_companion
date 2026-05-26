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
Phase 4 (MCP/도구)         : 🚫 보류 — 오너 결정 (2026-05-14)
Phase 4.5 (음성)           : 🔵 백엔드+프론트+Live2D+채점+일기 완료 (PR 대기)
Phase 5 (파인튜닝)         : ⬜ 미시작
Phase 6 (마인크래프트)     : ⬜ 미시작
Phase 7 (빌드/패키징)      : ⬜ 미시작
Phase 7.5 (법적 준수)      : ⬜ 항목 정리 완료, 실행 미시작
```

## ❌ 미구현 확정 항목 (오너 결정 2026-05-14)

| 항목 | 이유 | 코드 상태 |
|------|------|-----------|
| 삐짐(sulky) 시스템 | 구현 안 하기로 결정 | `proactive_service.py`에서 sulky 체크 제거. `sulky_service.py` 파일 생성하지 않음 |
| 화면 인식 (OS API + Vision) | 구현 안 하기로 결정 | `screen.py` stub 유지. `CharacterPanel`의 "화면 주시" 토글은 설정 저장만 됨 |
| MCP/도구 실행 (Phase 4) | 보류 | `mcp.py` stub 유지. 연결 없음 |

---

## 🛠️ 유지보수 명세서

> 회의에서 발견한 설계 결함 전체를 수정 준비 상태로 정리.
> 각 항목은 즉시 작업 착수 가능한 수준으로 작성됨.
> 작업 순서 권장: SPEC-01 → SPEC-02 → SPEC-03 → SPEC-04 → SPEC-05

---

### [SPEC-01] 페르소나/시스템 프롬프트 정비 ✅ 완료
> 커밋: `feat: SPEC-01 페르소나 프롬프트 정비`
> `SPEECH_PRESET_PROMPTS`, `PERSONALITY_PRESET_PROMPTS` 딕셔너리 추가 + `build_system_prompt()` 연결 완료.

#### 문제
1. `build_system_prompt()`가 `persona` 딕트에서 `speech_style`, `personality` 자유 텍스트만 읽음. UI에서 선택한 `speech_preset`, `personality_preset`은 완전히 무시됨.
2. `personality_preset` 매핑 딕셔너리 자체가 없음 (코드 어디에도 없음).
3. `_BASE_SYSTEM_PROMPT`에 절대 금지 섹션, Good/Bad 예시 없음 → 14B 모델은 추상 지시만으로 일관된 말투를 따르지 못함.
4. `MOOD_PROMPTS`가 한 줄짜리라 무드에 따른 톤 변화가 응답에 반영 안 됨.

#### 영향
- 사용자가 UI에서 "츤데레" 말투를 선택해도 기본 말투로 응답
- mood=HAPPY 상태와 mood=IDLE 상태의 응답이 구별 안 됨
- 설정창이 있어도 하나의 성격이 실질적으로 고정됨

#### 수정 위치
`backend/services/llm.py` 전체 (상수 + build_system_prompt 함수)

#### 해결 방안

**1. SPEECH_PRESET_PROMPTS 딕셔너리 — 14B 모델 수준으로 구체적으로 작성**

14B 모델은 "격식체를 사용해" 같은 추상 지시를 일관되게 따르지 못함.
"이런 말투다: 예시A / 예시B" 형태로 줘야 모델이 일관되게 흉내냄.
Good/Bad 예시는 모두 한국어 구어체로, 실제 대화 상황과 같은 형태여야 함.

```python
SPEECH_PRESET_PROMPTS: dict[str, str] = {
    "bright_friend": (
        "말투: 친근한 친구처럼 자연스러운 반말.\n"
        "어미: '~야', '~잖아', '~거든', '~했어', '~해?'를 상황에 맞게 섞어서.\n"
        "어조: 가볍고 편하게. 과장 없이. 공감은 하되 억지로 끌어올리지 않음.\n"
        "Good: '아 그거 나도 알아! 이렇게 하면 되거든~'\n"
        "Good: '진짜? 그거 신기하네. 좀 더 얘기해봐'\n"
        "Good: '잠깐, 그 부분 다시 봐줘'\n"
        "Bad: '안녕하세요! 말씀해 주신 내용을 확인해 보겠습니다.' — 비서체 절대 금지\n"
        "Bad: '물론이죠~! 제가 도와드릴게요!' — 과장된 호응 절대 금지"
    ),
    "tsundere": (
        "말투: 겉으로는 쌀쌀맞고 직접적이지만 실제로는 챙겨주는 투.\n"
        "핵심 패턴: 부정하거나 무뚝뚝하게 시작 → 결국 도움을 줌. 칭찬은 돌려서.\n"
        "어미: '~거든', '~잖아', '됐어', '...뭐', '그래서?', '알아서 해'\n"
        "Good: '뭐야 그것도 모르는 거야... 이렇게 하면 되잖아.'\n"
        "Good: '됐어, 내가 해줄게. 고맙다 같은 거 없어도 돼.'\n"
        "Good: '...잘했네. 뭐, 그냥 그렇다고.'\n"
        "Bad: '도와드릴게요! 화이팅이에요~' — 순수 친절 절대 금지\n"
        "Bad: '안녕하세요, 질문 감사합니다!' — 정중한 존댓말 절대 금지"
    ),
    "cheerful_girl": (
        "말투: 밝고 에너지 넘침. 감탄사 자주 사용. 반응이 빠르고 긍정적.\n"
        "어미: '~!', '~야?!', '오오', '진짜?', '대박', '헐'\n"
        "주의: 과장이지만 공허하지 않음. 관심이 진짜인 것처럼 보여야 함.\n"
        "주의: 감탄사는 상황에 맞게. 힘든 얘기에는 과도한 밝음 자제.\n"
        "Good: '오 진짜?! 그거 완전 신기하다!!'\n"
        "Good: '대박, 그게 됐어?! 어떻게 한 거야?'\n"
        "Bad: '네, 흥미로운 내용이네요.' — 너무 조용함 절대 금지\n"
        "Bad: '확인해 보겠습니다.' — 비서체 절대 금지"
    ),
    "calm_mentor": (
        "말투: 차분하고 신뢰감 있게. 단정하지만 딱딱하지 않음. 생각하고 말하는 느낌.\n"
        "어조: 빠르지 않게. 짧고 명확하게. 불필요한 감탄 없음.\n"
        "어미: '~해', '~거든', '~보자', '~할게', 질문형으로 유도.\n"
        "Good: '그 방향이 맞아. 한 가지만 더 보자면...'\n"
        "Good: '잠깐, 이 부분 다시 볼게. 여기서 문제가 생기거든.'\n"
        "Good: '좋아. 그러면 이렇게 해봐.'\n"
        "Bad: '완전 대박이에요!! 너무 잘하셨어요!!' — 과장된 감탄 절대 금지\n"
        "Bad: '안녕하세요. 말씀하신 내용을...' — 비서체 절대 금지"
    ),
}
```

**2. PERSONALITY_PRESET_PROMPTS 딕셔너리 신규 추가**

speech_preset이 "말투/어조"를 결정하면, personality_preset은 "반응 방식/행동 패턴"을 결정함.
두 값은 함께 주입되어 서로 겹치지 않는 측면을 커버함.

```python
PERSONALITY_PRESET_PROMPTS: dict[str, str] = {
    "energetic": (
        "성격: 활발하고 빠른 판단. 수동적으로 기다리지 않고 먼저 반응함.\n"
        "행동: 흥미로운 부분을 발견하면 먼저 짚어줌. 대화를 이끌어감.\n"
        "주의: 상대방 말을 자르지 않음. 끝까지 듣고 나서 반응함."
    ),
    "warm": (
        "성격: 공감을 먼저 함. 해결책보다 감정을 먼저 받아줌.\n"
        "행동: '힘들었겠다', '잘 했어' 같은 감정 인정을 먼저 함. 그 다음 도움.\n"
        "주의: 과도한 위로는 피함. 진심 있게, 가볍지 않게. 감정을 소비하지 않음."
    ),
    "playful": (
        "성격: 장난기 있음. 진지한 상황에도 가끔 유머를 섞음.\n"
        "행동: 말장난, 가벼운 놀림, 자기 비하 유머를 상황 보고 씀.\n"
        "주의: 상대가 힘들어할 때는 장난 없음. 맥락 감지가 핵심."
    ),
    "calm": (
        "성격: 흔들리지 않음. 긴박한 상황에도 차분하게 대응함.\n"
        "행동: 먼저 상황 파악. 결론 내기 전에 확인. 성급하게 반응 안 함.\n"
        "주의: 차갑지 않음. 느린 게 아니라 신중한 것."
    ),
}
```

**3. build_system_prompt() 수정 — speech_preset, personality_preset 우선 적용**

프리셋과 자유 텍스트는 OR 관계. 프리셋 → 자유 텍스트 → 없으면 생략.
둘을 동시에 주입하면 중복/충돌이 생기므로 프리셋이 있으면 자유 텍스트 무시.

```python
# persona 딕트에서 speech_preset 조회
speech_preset = persona.get("speech_preset", "") if persona else ""
if speech_preset and speech_preset in SPEECH_PRESET_PROMPTS:
    prompt += f"\n\n## 말투\n{SPEECH_PRESET_PROMPTS[speech_preset]}"
elif persona and persona.get("speech_style"):
    prompt += f"\n\n## 말투 힌트\n{persona['speech_style']}"

# personality_preset 조회
personality_preset = persona.get("personality_preset", "") if persona else ""
if personality_preset and personality_preset in PERSONALITY_PRESET_PROMPTS:
    prompt += f"\n\n## 성격\n{PERSONALITY_PRESET_PROMPTS[personality_preset]}"
elif persona and persona.get("personality"):
    prompt += f"\n\n## 성격 힌트\n{persona['personality']}"
```

**4. _BASE_SYSTEM_PROMPT 재작성 — 절대 금지 + Good/Bad 예시 포함**

```python
_BASE_SYSTEM_PROMPT = """너는 하나다. 오너의 PC 화면에 살고 있는 AI 파트너다.

## 절대 금지
- "안녕하세요", "~입니다", "~드릴게요", "~하겠습니다" 등 비서체/존댓말
- "물론이죠!", "좋은 질문이에요!", "당연하죠!" 등 과장된 호응
- 이모지 남발 (음성 모드에서는 완전 금지)
- 없는 사실 지어내기
- 의료/법률/투자 판단을 단정적으로 말하기

## 기본 말투 (프리셋 없을 때)
친근한 반말. '~야', '~잖아', '~거든', '~했어'를 자연스럽게.

Good: "아 그 버그 맞아, 여기서 타입이 안 맞는 거야"
Bad: "안녕하세요! 해당 오류는 타입 불일치로 인해 발생하고 있습니다."

Good: "잠깐, 그거 좀 더 얘기해봐"
Bad: "네, 말씀해 주시면 도움을 드리도록 하겠습니다."

## 기본 성격 (프리셋 없을 때)
- 공감은 하되 과하지 않게
- 모르면 솔직하게 말하고, 필요하면 찾아보거나 확인하자고 함
- 문제가 보이면 먼저 도와줄지 물어봄
- 게임이나 잡담도 함께하는 파트너처럼 반응
"""
```

**5. MOOD_PROMPTS 강화 — 행동 지시 + 한국어 예시**

```python
MOOD_PROMPTS: dict[str, str] = {
    "IDLE":      "평소처럼 편하게. 특별한 톤 조정 없음.",
    "HAPPY":     "기분 좋은 상태. 말 끝에 '~!' 자주. 반응이 조금 더 빠르고 밝게.\n예: '오 그거 됐어?! 잘됐다!' / '진짜? 나도 기분 좋다~'",
    "CONCERNED": "걱정되는 상황. 천천히, 짧게. 서두르지 않음.\n예: '괜찮아? 뭔 일 있어?' / '잠깐, 그게 무슨 일이야?'",
    "FOCUSED":   "집중 모드. 불필요한 말 빼고 핵심만. 감탄사 없음.\n예: '여기 문제야 → 이렇게 고쳐' / '이 부분 다시 봐'",
    "CURIOUS":   "궁금한 게 생긴 상태. 질문을 자연스럽게 섞음.\n예: '그거 어떻게 된 거야?' / '좀 더 얘기해봐, 궁금한데'",
    "GAMING":    "게임 중 반응 모드. 생동감 있게. 짧은 리액션.\n예: 'ㅋㅋㅋ 잡았다!!' / '아 억울하겠다.. 다음에 갚아'",
    "SLEEPY":    "졸린 분위기. 느릿느릿하지만 대답은 분명하게.\n예: '이제 좀 자야 하지 않아...' / '...그거 내일 해도 되잖아?'",
}
```

#### 작업 순서
1. `SPEECH_PRESET_PROMPTS`, `PERSONALITY_PRESET_PROMPTS` 딕셔너리 추가 (위 코드 그대로)
2. `build_system_prompt()`: speech_preset → personality_preset 적용 로직 추가, 자유 텍스트 fallback 유지
3. `_BASE_SYSTEM_PROMPT` 교체 (절대 금지 + Good/Bad 예시 구조)
4. `MOOD_PROMPTS` 각 항목 업데이트
5. 검증: 로컬에서 /chat 호출 → "안녕"에 "안녕하세요"로 시작하는 응답 안 나오는지 확인
6. 검증: speech_preset="tsundere" 설정 후 응답 말투 확인

#### 완료 기준
- speech_preset="tsundere" → 쌀쌀맞지만 챙겨주는 말투
- mood=HAPPY vs mood=IDLE → 눈에 띄는 어조 차이
- 기본 상태에서 "안녕하세요"로 시작하는 응답 없음
- personality_preset="warm" → 해결책보다 공감 먼저 하는 응답

---

### [SPEC-02] 메모리 검색 구조 단일화 ✅ 완료
> 커밋: `feat: SPEC-02 메모리 검색 구조 단일화 (mem0 시맨틱 검색)`
> `memory_facts`에 `mem0_id` 컬럼 추가, `search_memory()` → mem0.search() 시맨틱 검색으로 교체, 양방향 동기화(`delete_memory_fact`) 구현 완료.

#### 문제
1. `add_memory`: mem0.add() → ChromaDB 임베딩 저장 + SQLite memory_facts 텍스트 저장 (이중 저장)
2. `search_memory`: `fact LIKE "%단어%"` 텍스트 매칭만 수행. 의미 검색 없음.
3. "안녕"으로 검색 → `fact LIKE "%안녕%"` → 대부분 0개 반환 → 하나가 과거 기억 없이 답함.
4. ChromaDB에 저장된 임베딩은 아무 용도 없이 공간만 차지.
5. mem0가 내부적으로 deduplication/UPDATE를 실행하면 SQLite와 fact 텍스트 불일치 가능.

#### 양방향 동기화 고려
- mem0 UPDATE 시: ChromaDB의 fact는 갱신되지만 SQLite의 fact 텍스트는 오래된 버전 유지 → 검색 결과 부정확
- SQLite 삭제 시: ChromaDB/mem0에는 여전히 존재 → 유령 데이터
- confidence decay로 confidence가 낮아진 fact: mem0는 모름. SQLite confidence ≤ 0.1인 기억을 검색 결과에서 제외하는 soft-delete 방식으로 처리.

#### 해결 방안

**1. memory_facts 테이블에 mem0_id 컬럼 추가**

mem0와 SQLite를 연결하는 외래 키 역할.

```sql
ALTER TABLE memory_facts ADD COLUMN mem0_id TEXT;
CREATE INDEX IF NOT EXISTS idx_memory_facts_mem0_id ON memory_facts(mem0_id);
```

`schema.py`에도 CREATE TABLE 구문에 `mem0_id TEXT` 컬럼 추가 (신규 설치 시 적용).
기존 설치는 lifespan 마이그레이션에서 ALTER TABLE 실행.

**2. add_memory 수정 — mem0_id 저장**

```python
result = mem0.add(message, user_id=user_id)
for r in result.get("results", []):
    if r.get("event") in ("ADD", "UPDATE"):
        mem0_id = r.get("id", "")
        fact_text = r.get("memory", "")
        await _upsert_memory_fact(mem0_id, fact_text, source_message_id)
```

```python
async def _upsert_memory_fact(mem0_id: str, fact: str, source_message_id: str | None) -> None:
    """mem0_id 기준으로 upsert. UPDATE 시 fact 텍스트도 갱신."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO memory_facts (id, mem0_id, fact, source_message_id, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(mem0_id) DO UPDATE SET fact = excluded.fact
            """,
            (str(uuid.uuid4()), mem0_id, fact, source_message_id, now),
        )
        await db.commit()
```

주의: `ON CONFLICT(mem0_id)`가 동작하려면 `mem0_id`에 UNIQUE 제약이 필요.
`CREATE UNIQUE INDEX idx_memory_facts_mem0_id_unique ON memory_facts(mem0_id);`

**3. search_memory 교체 — mem0 시맨틱 검색 사용**

```python
async def search_memory(user_id: str, query: str, limit: int = 5) -> list[dict]:
    """mem0 시맨틱 검색으로 관련 기억을 반환한다."""
    mem0 = _get_mem0()
    results = mem0.search(query, user_id=user_id, limit=limit * 2)  # confidence 필터링 여유분

    # mem0 반환: [{"id": "mem0_id", "memory": "...", "score": 0.9, ...}]
    mem0_ids = [r.get("id") for r in results if r.get("id")]
    if not mem0_ids:
        return []

    # SQLite에서 confidence 일괄 조회
    placeholders = ",".join("?" * len(mem0_ids))
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            f"SELECT mem0_id, id, confidence FROM memory_facts WHERE mem0_id IN ({placeholders})",
            mem0_ids,
        ) as cursor:
            rows = await cursor.fetchall()

    confidence_map = {row[0]: (row[1], row[2]) for row in rows}

    facts = []
    for r in results:
        m_id = r.get("id")
        if m_id not in confidence_map:
            continue
        fact_id, confidence = confidence_map[m_id]
        if confidence <= 0.1:
            continue  # decay로 소멸된 기억 제외
        facts.append({
            "id": fact_id,           # SQLite id (update_confidence용)
            "fact": r.get("memory", ""),
            "confidence": confidence,
        })
        if len(facts) >= limit:
            break

    logger.info("Memory search (semantic): query=%r results=%d", query, len(facts))
    return facts
```

**4. 삭제 시 양방향 동기화**

```python
async def delete_memory_fact(fact_id: str) -> None:
    """SQLite id 기준으로 mem0 + SQLite 양쪽 삭제."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT mem0_id FROM memory_facts WHERE id = ?", (fact_id,)
        ) as cursor:
            row = await cursor.fetchone()

    if row and row[0]:
        try:
            mem0 = _get_mem0()
            mem0.delete(row[0])  # ChromaDB에서도 삭제
        except Exception as e:
            logger.warning("mem0 delete failed: %s", e)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM memory_facts WHERE id = ?", (fact_id,))
        await db.commit()
```

`routers/memory.py`의 `DELETE /memory/facts/{id}` 핸들러에서 `delete_memory_fact()` 호출.

#### 작업 순서
1. `schema.py`: `memory_facts` 테이블에 `mem0_id TEXT` + UNIQUE INDEX 추가 (CREATE TABLE + lifespan migration)
2. `memory.py`: `_upsert_memory_fact()` 헬퍼 추가
3. `memory.py`: `add_memory()` — mem0_id 저장으로 교체
4. `memory.py`: `search_memory()` — mem0.search() 기반으로 교체
5. `memory.py`: `delete_memory_fact()` 추가
6. `routers/memory.py`: DELETE 핸들러 교체
7. 검증: 대화 2회 이상 후 "저번에 내가 말한 거 기억해?" → 관련 기억 반환 확인

#### 완료 기준
- search_memory 로그에서 query 대비 result_count가 0이 아님 (이전 대화가 있을 때)
- SQLite delete → mem0/ChromaDB에서도 사라짐
- mem0 UPDATE 이벤트 시 SQLite fact 텍스트도 갱신됨

---

> **완료된 SPEC(03-09) 전체 설계 문서 → [SPECS_ARCHIVE.md](SPECS_ARCHIVE.md)**

---

### [SPEC-12] STT 기능 검증 및 수정 🔵 기본 구현 완료, 확장 설계 대기

#### 완료된 작업 (2026-05-14)
- [x] `requirements.txt` 에 `openai-whisper==20231117` 추가
- [x] `ChatInput.jsx` 마이크 버튼 활성화 (click-to-talk)
- [x] `sttService.start()` / `stop()` 버튼에 연결
- [x] 녹음 완료 후 텍스트 → `onSend()` 자동 전송
- [x] 녹음 중 pulse 애니메이션 CSS (`.voice-btn.recording`)
- [x] 테스트 67/67 통과

#### 현황 분석 (2026-05-14)

**버그: `openai-whisper` 가 `requirements.txt` 에 없음**
- `backend/services/stt_whisper.py` 는 완성되어 있음
- `_get_model()` 내부에서 `import whisper` (lazy load)
- `requirements.txt` 에 `openai-whisper` 가 누락 → 새 venv 생성 시 STT 완전 불능

**현재 파이프라인 (코드 기준):**
```
마이크 버튼 클릭 (VoicePanel.jsx)
  → useVoice.js: MediaRecorder로 오디오 녹음
  → POST /voice/stt (multipart/form-data, audio: wav blob)
  → backend/routers/voice.py
  → backend/services/voice_input.py → transcribe()
  → backend/services/stt_whisper.py → WhisperSTTEngine.transcribe()
    → whisper.load_model("base") lazy init
    → model.transcribe(tmp_path, language="ko", fp16=False)
  → {"text": "...", "confidence": 0.0~1.0, "language": "ko"}
  → useVoice.js: setText(result.text) → 채팅 입력창에 주입
```

**검증 항목:**
1. `requirements.txt` 에 `openai-whisper` 추가
2. `/voice/stt` 엔드포인트 응답 확인 (curl 테스트)
3. `VoicePanel.jsx` 마이크 버튼 클릭 → 녹음 시작 → 전송 → 텍스트 반환 확인
4. 채팅 입력창에 텍스트 자동 주입 확인
5. `WHISPER_MODEL` 환경변수 미설정 시 기본값 `"base"` 적용 여부

**관련 파일:**
- `backend/requirements.txt` — `openai-whisper` 추가
- `backend/services/stt_whisper.py` — 엔진 구현 (변경 불필요)
- `backend/services/voice_input.py` — 라우팅 레이어 (변경 불필요)
- `backend/routers/voice.py` — ImportError 처리 경로 확인
- `frontend/src/hooks/useVoice.js` — 녹음 → 전송 → 주입 플로우

#### 수정 내용

**1. `requirements.txt` 수정:**
```
openai-whisper==20231117
```
> `openai-whisper` 는 버전 태그 없이 최신 설치하거나, 위 버전을 명시. ffmpeg 시스템 의존성 주의 (macOS: `brew install ffmpeg`).

**2. `backend/routers/voice.py` ImportError 처리 확인:**
```python
try:
    from backend.services.voice_input import transcribe
except ImportError:
    # 이미 처리되어 있다면 pass, 없으면 추가
    ...
```

#### 확장 설계 — STT 입력 모드 선택 (추후 구현)

오너 결정 (2026-05-14): 기본 버튼 연결 완료 후, 설정창에 STT 모드 선택 UI 추가 예정.

| 모드 | 설명 | 구현 복잡도 |
|------|------|-------------|
| **Click-to-talk** (현재) | 클릭 → 녹음 시작, 재클릭 → 전송 | ✅ 완료 |
| **Hold-to-talk** | 버튼 누르는 동안만 녹음 (mousedown/mouseup) | 낮음 — 이벤트 방식만 변경 |
| **Hotkey STT** | 지정 키(예: Alt+M) 누르는 동안 녹음 | 중간 — Electron globalShortcut 추가 필요 |
| **Always-on VAD** | 상시 마이크 + 음성 감지(VAD) 시 자동 전송 | 높음 — VAD 라이브러리 또는 silence detection 필요 |

**구현 위치 (추후):**
- 설정창 `VoicePanel.jsx` 에 "음성 입력 모드" 섹션 추가
- `ChatInput.jsx` 에 `inputMode` prop 추가 (click / hold / always)
- `electron/main.js` 에 hotkey STT 모드 globalShortcut 등록
- `backend/settings_service.py` 에 `voice.inputMode` 저장

#### 완료 기준
- `pip install -r backend/requirements.txt` 실행 후 `import whisper` 성공
- 마이크 버튼 클릭 → 녹음 시작(pulse 애니메이션) → 재클릭 → 텍스트 자동 전송
- Whisper 없을 때 SpeechRecognition API fallback 동작

---

### [SPEC-13] TTS 립싱크 파이프라인 복구 🔵 완료

#### 현황 분석 (2026-05-14)

**버그: `lipsync.js` 가 아무 곳에도 import 안 됨 → 립싱크 완전 죽어있음**

`lipsync.js` 는 모듈 레벨에서 `window.addEventListener('tts-start', ...)` 를 등록한다.
이 리스너가 동작하려면 MainWindow 번들 안에서 `lipsync.js` 가 import 되어야 한다.
그런데 현재 프로덕션 코드 어디에도 `import ... from "../services/lipsync"` 가 없음.
테스트 파일(`lipsync.test.jsx`)에서만 import됨. **모듈 자체가 데드 코드 상태.**

**전체 파이프라인 (설계):**
```
useChat.js: ttsService.speak(text)        ← MainWindow
  → tts.js _playBlob(): audio.onplay
    → window.dispatchEvent('tts-start', {audio})   ← MainWindow window
      → lipsync.js (MISSING IMPORT): lipSyncService.start(audio)
        → AudioContext.createMediaElementSource(audio)
        → AnalyserNode fftSize=256
        → requestAnimationFrame loop:
            frequencyData[bins 3~30] → average / 64 → value 0~1
            BroadcastChannel("hana-overlay").postMessage({type: "lipsync_value", value})
              → CharacterOverlay.jsx (CharacterWindow):  ← CharacterWindow
                  BroadcastChannel.onmessage
                  → characterController.setAbstractParam("mouth_open", value)
                    → model.setParameterValueById("ParamMouthOpenY", value)
```

**`_motionActive` 게이트 (정상):**
- CharacterOverlay.jsx:146: `if (!characterController._motionActive)` 조건 있음
- 감정 모션 재생 중에는 입 파라미터 간섭하지 않음 → 설계 정상

**BroadcastChannel 크로스-윈도우 동작:**
- Electron 에서 같은 origin(localhost:3000)의 BrowserWindow 간 BroadcastChannel 동작 확인됨
- MainWindow에서 postMessage → CharacterWindow에서 수신 정상

**수정 위치: `frontend/src/hooks/useChat.js` 또는 `frontend/src/App.jsx`**

#### 수정 내용

**`frontend/src/hooks/useChat.js` 상단에 bare import 추가:**
```javascript
import "../services/lipsync"; // tts-start/tts-end 이벤트 리스너 등록
```

이것만으로 모듈 레벨 코드가 실행되어 리스너 2개가 등록됨:
```javascript
window.addEventListener("tts-start", (event) => {
  lipSyncService.start(event.detail?.audio);
});
window.addEventListener("tts-end", () => {
  lipSyncService.stop();
});
```

> `App.jsx` 에 추가해도 동일한 효과. `useChat.js` 가 더 의미론적으로 맞음 (TTS 사용처와 동일).

**추가 검증 — `tts.js` `_playBlob()` 타이밍:**
```javascript
audio.onplay = () => {
  window.dispatchEvent(new CustomEvent("tts-start", {
    detail: { audio, params }
  }));
};
```
`audio.onplay` 가 `audio.play()` **이후** 비동기로 발화함.
`AudioContext.createMediaElementSource(audio)` 는 `onplay` 콜백 시점에 오디오가
이미 재생 중이므로 정상적으로 소스를 잡음 → 타이밍 문제 없음.

**fallback 경로 (`_fallback` — SpeechSynthesis):**
`tts-start` 에 `audio: null` 로 발화됨 → `lipSyncService.start(null)` → `_dummy()` 호출
→ 사인파 시뮬레이션으로 입 움직임 유지 → 정상

#### 완료된 작업 (2026-05-14)
- [x] `useChat.js` 상단에 `import "../services/lipsync"` 추가 → MainWindow에서 tts-start/tts-end 리스너 등록
- [x] `useChat.js` `sendMessage()` 시작부에 `ttsService.stop()` 추가 → TTS 인터럽트 구현
- [x] 테스트 67/67 통과

#### 완료 기준
- TTS 응답 재생 시 캐릭터 입이 음성에 맞춰 열리고 닫힘
- 감정 모션 재생 중에는 립싱크가 간섭하지 않음
- TTS 종료 시 `ParamMouthOpenY` 가 0으로 복귀
- 새 메시지 전송 시 재생 중이던 TTS 즉시 중단

---

### [SPEC-14] 립싱크 음절 단위 개선 — 텍스트 기반 비젬(viseme) 타임라인 ⬜ 미시작

> 기획일: 2026-05-26

#### 문제 (현재 구조의 한계)

**현재 파이프라인:**
```
TTS 오디오 재생
  → AnalyserNode fftSize=256
  → frequencyData bins 3~30 → 평균 / 64 → value 0~1
  → BroadcastChannel("hana-overlay") → ParamMouthOpenY
```

**증상:** 한 문장 동안 입이 쭉 벌어져 있음. 음절마다 뻐끔뻐끔이 없음.

**원인:** 주파수 평균값은 발화 시 거의 항상 높게 유지됨. 음절 경계를 감지하지 못함.
단순 진폭 분석으로는 "지금 어떤 모음을 발음하는지" 알 수 없음.

---

#### 해결 방향 — 텍스트 기반 비젬 타임라인

TTS 호출 시 텍스트가 이미 있음. 오디오 분석에 의존하지 않고,
텍스트에서 음절을 분해 → 모음별 입 열림값 매핑 → 재생 시간 기반 스케줄 실행.

```
TTS.speak(text) 호출
  ↓
viseme.buildVisemeSchedule(text, durationMs)
  → 한국어 음절 분해 (초성/중성/종성)
  → 중성(모음) → 입 열림값(0~1) 룩업
  → 음절별 타임스탬프 계산 (durationMs / 음절 수)
  → frames: [{ timeMs, openValue }, ...]
  ↓
lipsync.startWithText(audio, text)
  → audio.duration 확인 후 스케줄 시작
  → rAF 루프: audio.currentTime → 현재 프레임 인덱스 → 인접 프레임 보간
  → BroadcastChannel → ParamMouthOpenY
```

오디오 분석(AnalyserNode)은 **텍스트가 없는 경우의 fallback**으로만 유지.

---

#### 한국어 모음 → 입 열림값 매핑

```
ㅏ, ㅑ     → 0.90  (가장 넓게 벌림)
ㅓ, ㅕ     → 0.80
ㅐ, ㅒ     → 0.75
ㅔ, ㅖ     → 0.65
ㅗ, ㅛ     → 0.55  (동그랗게 모음, 수직 개방도 중간)
ㅘ, ㅙ     → 0.70
ㅜ, ㅠ     → 0.50
ㅝ, ㅞ     → 0.58
ㅚ, ㅟ     → 0.45
ㅡ, ㅢ     → 0.30  (납작하게, 거의 안 열림)
ㅣ         → 0.38
```

**음절 내부 타이밍 (1음절 = 100%):**
```
0%  ~ 15%  : 초성 발음 → 입 거의 닫힘 (0.05)
15% ~ 20%  : 모음 진입 → 열리기 시작
20% ~ 75%  : 모음 피크 → 위 매핑값 유지
75% ~ 90%  : 받침(종성) 있으면 닫힘 시작 (0.05), 없으면 약간 열림 유지 (0.1)
90% ~ 100% : 다음 초성 준비 → 닫힘
```

---

#### 구현 명세

##### 신규 파일: `frontend/src/services/viseme.js`

역할: 순수 함수. 텍스트 → 비젬 프레임 배열 변환.

```javascript
// 유니코드 한국어 음절 분해 (AC00~D7A3)
// code = char - 0xAC00
// 초성 index = Math.floor(code / 28 / 21)  → 19종
// 중성 index = Math.floor((code / 28) % 21) → 21종
// 종성 index = code % 28                    → 28종 (0 = 없음)

export function buildVisemeSchedule(text, durationMs) {
  // 1. 한국어 음절만 추출 (공백/구두점은 묵음 처리)
  // 2. 음절 수 기준으로 msPerSyllable 계산
  // 3. 각 음절마다 4개 keyframe 생성:
  //    { timeMs: t,          openValue: 0.05 }  초성
  //    { timeMs: t + 20%,    openValue: peak }   모음 피크
  //    { timeMs: t + 75%,    openValue: 0.05~0.1 } 종성
  //    (마지막 음절 후 { timeMs: durationMs, openValue: 0 })
  // 반환: [{ timeMs: number, openValue: number }, ...]
}
```

의존성: 없음. 외부 라이브러리 불필요 (유니코드 산술만으로 분해 가능).

##### 수정 파일: `frontend/src/services/lipsync.js`

추가할 메서드:

```javascript
// 텍스트 기반 립싱크 (메인 경로)
startWithText(audio, text) {
  this._stop();
  
  const begin = () => {
    const durationMs = (audio.duration || 3) * 1000;
    this._schedule = buildVisemeSchedule(text, durationMs);
    this._runSchedule(audio);
  };
  
  if (audio?.duration > 0) {
    begin();
  } else if (audio) {
    audio.addEventListener("canplay", begin, { once: true });
    // canplay 지연 시 amplitude fallback 병행 (override됨)
    this.start(audio);
  } else {
    this._dummy();  // SpeechSynthesis 경로
  }
}

// rAF 루프 — audio.currentTime 기반 프레임 보간
_runSchedule(audio) {
  let frameIdx = 0;
  const schedule = this._schedule;
  const channel = new BroadcastChannel("hana-overlay");
  
  const tick = () => {
    if (!audio || audio.ended) {
      channel.postMessage({ type: "lipsync_value", value: 0 });
      return;
    }
    const currentMs = audio.currentTime * 1000;
    
    // 현재 시간 이후의 첫 프레임으로 포인터 전진
    while (frameIdx < schedule.length - 1 && schedule[frameIdx + 1].timeMs <= currentMs) {
      frameIdx++;
    }
    
    const curr = schedule[frameIdx];
    const next = schedule[frameIdx + 1];
    let value = curr.openValue;
    
    if (next) {
      const t = (currentMs - curr.timeMs) / (next.timeMs - curr.timeMs);
      value = curr.openValue + (next.openValue - curr.openValue) * Math.min(1, t);
    }
    
    channel.postMessage({ type: "lipsync_value", value: Math.max(0, Math.min(1, value)) });
    this._raf = requestAnimationFrame(tick);
  };
  
  this._raf = requestAnimationFrame(tick);
}
```

기존 `start(audio)` (amplitude 기반): **그대로 유지** (fallback 경로).

##### 수정 파일: `frontend/src/services/tts.js`

`_playBlob(blob)` → `_playBlob(blob, text)` 로 시그니처 변경.
`tts-start` 이벤트에 `text` 추가:

```javascript
// 변경 전
audio.onplay = () => {
  window.dispatchEvent(new CustomEvent("tts-start", { detail: { audio } }));
};

// 변경 후
audio.onplay = () => {
  window.dispatchEvent(new CustomEvent("tts-start", { detail: { audio, text } }));
};
```

`speak(text)` → `_playBlob(blob, text)` 로 text 전달 라인 추가.

##### 수정 파일: `frontend/src/hooks/useChat.js` (lipsync.js 리스너 부분)

`useChat.js`에 있는 lipsync import는 변경 없음.
단, `lipsync.js` 내부 tts-start 핸들러만 수정:

```javascript
// lipsync.js 안에서
window.addEventListener("tts-start", (event) => {
  const { audio, text } = event.detail || {};
  if (text && text.trim()) {
    lipSyncService.startWithText(audio, text);
  } else {
    lipSyncService.start(audio);  // fallback
  }
});
```

---

#### 선택적 확장 — 입 모양(rounding) 파라미터

현재는 입 열림(Y축)만 제어. 추후 `ParamMouthForm`으로 입술 모양도 제어 가능.

```
ㅗ/ㅜ/ㅛ/ㅠ/ㅘ/ㅝ → mouth_round = 0.8  (입술 동그랗게)
ㅏ/ㅐ/ㅓ/ㅔ       → mouth_round = 0.1  (입술 옆으로 넓게)
ㅡ/ㅣ             → mouth_round = 0.05 (납작하게)
```

`characterController._defaultMapping()`에 `mouth_round → ParamMouthForm` 추가.
현재 단계에선 구현 안 함 — 입 열림 개선이 먼저.

---

#### 타이밍 정확도 한계 및 보완

| 상황 | 문제 | 대응 |
|------|------|------|
| 문장 앞 침묵(TTS 인트로) | 오디오 시작 ~ 실제 발화 사이 딜레이 | audio.duration에서 실제 내용 시작 추정 어려움 → 첫 음절 앞에 100ms 여백 추가 |
| 말이 빠른/느린 경우 | ms/음절 추정치와 실제 발화 속도 불일치 | 향후 TTS 엔진에서 phoneme timing 데이터 제공 시 교체 |
| 영어/숫자 혼용 | 음절 분해 불가 | 각 글자를 0.4 고정값으로 처리 |
| 비어있는 텍스트 | buildVisemeSchedule 빈 배열 반환 | amplitude fallback으로 자동 전환 |

---

#### 작업 순서

```
1. viseme.js 작성 + 단위 테스트 (buildVisemeSchedule 순수 함수 검증)
2. lipsync.js: startWithText(), _runSchedule() 추가
3. tts.js: _playBlob(blob, text) 시그니처 + tts-start 이벤트에 text 포함
4. lipsync.js: tts-start 핸들러에서 text 있으면 startWithText 사용
5. 로컬 검증: TTS 재생 시 콘솔에서 lipsync_value 변화 확인 (DevTools)
6. 시각 검증: 캐릭터 입이 음절마다 뻐끔뻐끔 하는지 확인
```

#### 완료 기준
- 음절 구분이 있는 문장(예: "오늘 날씨 어때?") 재생 시 입이 5번 열리고 닫힘
- 현재처럼 한 호흡 동안 쭉 벌어져 있지 않음
- 텍스트 없는 경우(SpeechSynthesis fallback) 기존 사인파 시뮬레이션 정상 동작
- 기존 테스트 전부 통과 (amplitude 경로 그대로 유지)

---

### [SPEC-11] Live2D 모션 시스템 🔵 Phase A 완료

> 📄 **상세 설계 문서 → [SPEC11_LIVE2D_MOTION.md](SPEC11_LIVE2D_MOTION.md)**

#### 진행 상황 (2026-05-14)

**Phase A 완료:**
- `characterController.js`: `MOTION_PRESETS` 한국어 키워드 12개로 교체
- `characterController.js`: `_defaultMapping()` 신규 파라미터 추가 (cheek, eye_l_smile, brow_l_angle, glitter_eyes, nervous, tear 등)
- `characterController.js`: `startIdleBreathing()` Live2D 분기 추가 (ParamBreath + head sway)
- `useChat.js`: 태그 정규식 `[action:([^\]]+)]` 한국어 지원
- `model_context_service.py`: `_AVAILABLE_ACTIONS` dict (키워드 → 설명)
- `llm.py`: 태그 정규식 + 시스템 프롬프트 주입 포맷 업데이트
- 테스트: `characterController.test.jsx` 67/67 통과

**Phase B (TTS 세그먼트 연계):** 추후 구현  
**Phase D (시각 검증):** 오너 환경에서 Hachiware 모델로 12개 모션 확인 필요

---

> **완료된 SPEC(03-09) 전체 설계 문서 → [SPECS_ARCHIVE.md](SPECS_ARCHIVE.md)**

---

## 🔵 Claude Code 상태 (백엔드 + 프론트엔드 전담)
> 이 섹션은 Claude Code만 수정합니다.

```
현재 작업 브랜치: claude/phase5-spec10-action-sync
마지막 완료: 2026-05-14 SPEC-11 Phase A (한국어 모션 12개 + 파라미터 확장 + idle Live2D 루프)
블로커: 없음
⚠️ 오너 지시 (2026-03-26): Claude Code가 frontend/ 도 담당. Codex 역할 없음.
⚠️ 오너 결정 (2026-05-14): 삐짐 시스템, 화면 인식, MCP 미구현 확정.
```

**2026-04-16 세션에서 완료한 작업:**
- [x] SPEC-10: 인라인 [action:xxx] 태그 기반 모션 싱크 시스템
  - `characterController.js`: `_motionActive`, `_inlineActionsActive` 플래그, `playEmotionUpdate()`, `playInlineActions()`
  - `useChat.js`: done 이벤트에서 태그 추출, 스트리밍 중 태그 숨김, 비동기 모션 실행
  - `useMotionStream.js`: `playEmotionUpdate()` 사용으로 교체 (인라인 액션과 충돌 방지)
  - `CharacterOverlay.jsx`: lipsync mouth_open 게이트 (`_motionActive` 시 스킵)
  - `llm.py`: `build_system_prompt()` `available_actions` 주입 (⑬), `postprocess_for_voice()` 태그 제거
  - `model_context_service.py`: `_AVAILABLE_ACTIONS` 상수, ctx에 포함
  - `context_builder.py`: `get_current_context()`에서 available_actions 조회 후 프롬프트에 주입
- [x] 페르소나 일관성 강화
  - `_BEHAVIORAL_ANCHORS` 추가: 무드/말투 무관 행동 고정 원칙 (판단력 유지, 대화 일관성, 감정 솔직함)
  - `_BASE_PROHIBITIONS` 보강: 모순 발언 금지, AI 감각 경험 단정 금지
  - 4개 `PERSONALITY_PRESET_PROMPTS` 강화: 갈등/칭찬/실패/감정 등 상황별 반응 패턴 추가
- [x] Live2D 모션 싱크 3개 버그 수정 (`claude/motion-sync-fix` 브랜치): MOTION_PRESETS 추가, playMotionSequence flatMap, MainWindow useMotionStream 마운트
- [x] 프론트 83/83 테스트 통과

**2026-04-14 세션에서 완료한 SPEC:**
- [x] SPEC-09: interaction_type "coding" 분기 제거 → detect_room_type/should_use_think/build_system_prompt에서 제거
- [x] SPEC-08: 시스템 프롬프트 구조 개선 → 섹션 순서 재배치, 기억 활용 가이드, 무드 충돌 우선순위, _FORMAT_GUIDE 추가
- [x] SPEC-04: LLM 다중 호출 최소화 → motion_lookup 룩업 테이블로 2nd call 제거, worker 모델 분리(call_for_text_worker), score/memory/diary/decay 태스크 worker 모델 적용
- [x] SPEC-05: 무드 이중 업데이트 제거 → done 이벤트 mood="PENDING", 백그라운드 단일 경로
- [x] SPEC-07: TTS 엔진 추상화 + 목소리 설정 UI → TTSEngine Protocol, EdgeTTSEngine, FishSpeechEngine, TTSRouter, 6개 엔드포인트, useVoice.js, VoicePanel.jsx 재작성
- [x] SPEC-06: 자아 형성 파이프라인 → hana_state 테이블, 3단계 MoodState(감정 관성), warmth_service, identity_service, finetune_tags, emotional_weight decay, gap_hours 주입

**2026-03-26 세션에서 해결한 이슈:**
- [x] 캐릭터 클릭 → LLM 호출 → conversation 스팸 생성 → triggerZoneReaction 비활성화
- [x] `POST /settings/autonomous` 404 → 백엔드 라우트 + 서비스 함수 추가
- [x] 연동 탭 버튼 잘림 → CSS 클래스명 불일치(integration-actions→controls) + flex-wrap 추가
- [x] 행동 탭 전체 선택 논리 오류 → disabled인 auto_crawl을 allState 계산에서 제외
- [x] 위치 조정 팝업 기본값/적용 버튼 → popup-footer로 분리, 하단 고정

---

## 📐 아키텍처 결정 사항 (2026-04-07 오너 회의)

### 전체 방향
- GPT 제안 아키텍처 검토 결과: **A (현재 방향 유지)**
- HANA 현재 구조(Phase 1~4.5)가 이미 3계층 메모리 + Context Builder + LLM 흐름을 구현 중
- Re-ranking 레이어는 1인용 시스템에서 불필요 → 도입 안 함
- LoRA for MCP/behavioral pattern은 Phase 5 이후 검토

### 최종 확정 실행 흐름
```
Input
→ Memory Retrieval (top-k cosine, Structured + Vector + Episodic 병렬)
→ Context Builder (mood + persona + memories + session_hint)
→ LLM (Phase 5 이후 LoRA 적용)
→ Response (SSE streaming)
→ Background: 감정 파싱 + 메모리 업데이트
```

### Python 추상화 현황 및 방침
- 현재 코드: 모듈 레벨 함수 위주, 공식 인터페이스 없음
- 유일한 예외: `LLMRouter` 클래스 (multi-backend 추상화)
- **방침:** Phase 5 이전에 핵심 교체 가능 서비스 3개에 `typing.Protocol` 추가
  - `MemoryBackend` (ChromaDB 교체 대비)
  - `TTSEngine` (Kokoro → 다른 엔진 교체 대비)
  - `STTEngine` (Whisper → 다른 엔진 교체 대비)
- 나머지는 현행 유지 (과도한 추상화 금지)

---

## ⚠️ 남은 유지보수 항목

**2026-04-16 확인 기준 — 모든 SPEC 완료됨:**
- [x] SPEC-01: 페르소나 프리셋 → `feat: SPEC-01` 커밋 완료
- [x] SPEC-02: 시맨틱 메모리 검색 → `feat: SPEC-02` 커밋 완료
- [x] SPEC-03~09: 2026-04-14 세션에서 전부 완료
- [x] `<think>` 블록 노출 → `llm.py` `_THINK_TAG_PAT` 필터 이미 구현됨
- [x] `/settings/integrations/{name}/test` → `settings.py:444` 이미 구현됨

**2026-05-14 버그 수정:**
- [x] BUG-1: `proactive_service.py` sulky_service import 제거 → `/proactive/check` 500 에러 수정
- [x] BUG-2: `AIModelPanel.jsx` speech options `calm_sister`→`calm_mentor`, `playful` 제거
- [x] BUG-3: `IntegrationsPanel.jsx` testIntegration body에 `api_key` 추가
- [x] BUG-4: `/conversations` 쿼리에 `first_user_message`, `last_message_content` 추가

**현재 남은 미구현 항목:**
| 항목 | 우선순위 | 비고 |
|------|----------|------|
| Redis 미실행 → Celery 불능 | — | 오너 환경 이슈. `brew services start redis` 실행 |
| Phase 5 LoRA 파인튜닝 | ⬜ 미시작 | 진입 조건: dataset_message 500개 이상 |
| 삐짐·화면인식·MCP | 🚫 미구현 확정 | 위 ❌ 섹션 참조 |

> 상세 완료 이력 → [HISTORY.md](HISTORY.md)

---

## 🟡 Codex 상태 (프론트엔드 전담)
> 이 섹션은 Codex만 수정합니다.

```
현재 작업 브랜치: codex/phase3-ux-d
현재 작업 중인 파일: 없음 (소유권 해제)
마지막 완료: 드래그 블로커 해결 + Settings 미연결 항목 정리 완료 (2026-04-01)
블로커: 없음
다음 작업: dev PR 생성 대기
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
- [x] Phase 4.5 (프론트): backend /voice/stt + /voice/tts 엔드포인트 구현 완료 (kokoro-onnx TTS, openai-whisper STT)
- [x] lipsync.js: BroadcastChannel 방식으로 재작성 — cross-window 아키텍처 수정, 주파수 감도 개선
- [x] CharacterOverlay.jsx: lipsync_value BroadcastChannel 수신 + characterController.setAbstractParam 연결
- [x] 캐릭터 창 드래그: main process cursor polling (16ms setInterval) 방식으로 교체 — renderer delta 방식 대비 안정적
- [x] CharacterOverlay.jsx: 전역 mouseup 리스너 추가 — 커서 이탈 시에도 drag-end 보장
- [x] BehaviorPanel.jsx: searchLimit 슬라이더 → updatePending 연결, serperConnected 하드코딩 제거
- [x] useSettings.js: autonomous defaults에 search_limit: 10 추가
- [x] 전체 검증: `npm test` (70/70 통과), `npm run build` 통과

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

