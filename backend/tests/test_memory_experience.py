"""
메모리 서비스 + 경험 수집 + 선호 시스템 테스트.
chromadb를 mock으로 대체하여 Docker 없이도 실행 가능.
API 엔드포인트 테스트는 httpx AsyncClient 사용.
"""

import asyncio
import sys
import types
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio


# ---------------------------------------------------------------------------
# chromadb stub — 모듈이 없는 환경에서 mock으로 대체
# ---------------------------------------------------------------------------

def _make_chroma_stub():
    """chromadb 패키지를 흉내내는 최소 stub을 sys.modules에 주입한다."""
    if "chromadb" in sys.modules:
        return  # 실제 패키지가 있으면 그대로 사용

    chroma_mod = types.ModuleType("chromadb")

    class _Collection:
        def __init__(self, name):
            self.name = name
            self._docs: dict = {}  # id → {document, metadata}

        def count(self):
            return len(self._docs)

        def add(self, ids, documents=None, metadatas=None, embeddings=None):
            for i, doc_id in enumerate(ids):
                self._docs[doc_id] = {
                    "document": (documents or [""])[i],
                    "metadata": (metadatas or [{}])[i],
                }

        def get(self, ids=None, include=None):
            if ids:
                result_ids, docs, metas = [], [], []
                for doc_id in ids:
                    if doc_id in self._docs:
                        result_ids.append(doc_id)
                        docs.append(self._docs[doc_id]["document"])
                        metas.append(self._docs[doc_id]["metadata"])
                return {"ids": result_ids, "documents": docs, "metadatas": metas}
            all_ids = list(self._docs.keys())
            all_docs = [self._docs[i]["document"] for i in all_ids]
            all_metas = [self._docs[i]["metadata"] for i in all_ids]
            return {"ids": all_ids, "documents": all_docs, "metadatas": all_metas}

        def query(self, query_texts, n_results=5, include=None):
            # 간단 구현: 모든 항목 반환 (거리 0.1 고정)
            all_ids = list(self._docs.keys())[:n_results]
            docs = [self._docs[i]["document"] for i in all_ids]
            metas = [self._docs[i]["metadata"] for i in all_ids]
            distances = [0.1] * len(all_ids)
            return {
                "ids": [all_ids],
                "documents": [docs],
                "metadatas": [metas],
                "distances": [distances],
            }

        def update(self, ids, metadatas=None, documents=None):
            for i, doc_id in enumerate(ids):
                if doc_id in self._docs:
                    if metadatas:
                        self._docs[doc_id]["metadata"].update(metadatas[i])
                    if documents:
                        self._docs[doc_id]["document"] = documents[i]

        def delete(self, ids):
            for doc_id in ids:
                self._docs.pop(doc_id, None)

    class _Client:
        def __init__(self, path=None):
            self._cols: dict[str, _Collection] = {}

        def get_or_create_collection(self, name, metadata=None):
            if name not in self._cols:
                self._cols[name] = _Collection(name)
            return self._cols[name]

        def get_collection(self, name):
            if name not in self._cols:
                raise ValueError(f"Collection {name} not found")
            return self._cols[name]

    chroma_mod.PersistentClient = _Client
    sys.modules["chromadb"] = chroma_mod


_make_chroma_stub()


# ---------------------------------------------------------------------------
# 공통 픽스처
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def isolate_memory_service():
    """각 테스트마다 memory_service 전역 상태를 초기화한다."""
    from backend.services import memory_service
    memory_service.reset_collections_for_test()
    yield
    memory_service.reset_collections_for_test()


@pytest.fixture(autouse=True)
def use_tmp_db(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setenv("DB_PATH", db_file)
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)


# ---------------------------------------------------------------------------
# memory_service 기본 동작
# ---------------------------------------------------------------------------

class TestMemoryService:
    def test_add_and_search_volatile(self):
        from backend.services.memory_service import add_volatile, search_volatile

        add_volatile("테스트 단기 기억", metadata={"emotion": "HAPPY"})
        results = search_volatile("테스트 단기 기억")
        assert len(results) >= 1
        assert "테스트" in results[0]["text"]

    def test_add_and_search_longterm(self):
        from backend.services.memory_service import add_longterm, search_longterm

        # stub의 query는 거리 0.1을 반환 → DEDUP_THRESHOLD=0.92 → 1-0.92=0.08 < 0.1 이면 중복
        # 첫 번째 추가이므로 count()==0, dedup 검사 건너뜀
        doc_id = add_longterm("코딩을 좋아한다", metadata={"confidence": 1.0})
        assert doc_id
        results = search_longterm("코딩")
        assert len(results) >= 1

    def test_add_longterm_dedup(self):
        """이미 항목이 있을 때 두 번째 추가는 stub 거리 0.1 < 0.08? 아님 — stub은 0.1 반환."""
        # stub 거리=0.1, DEDUP_THRESHOLD=0.92 → 1-0.92=0.08 → 0.1 >= 0.08 이므로 중복 아님
        # 실제 chromadb는 코사인 유사도로 정확히 판단하지만 stub에선 중복 건너뜀이 발생하지 않음
        # 이 테스트는 stub에서는 두 번 모두 추가됨을 확인
        from backend.services.memory_service import add_longterm

        id1 = add_longterm("코딩을 매우 좋아한다")
        id2 = add_longterm("완전히 다른 내용")
        assert id1
        assert id2

    def test_update_confidence(self):
        from backend.services.memory_service import (
            add_longterm, update_longterm_confidence, _get_collection, COL_LONGTERM,
        )

        doc_id = add_longterm("기억 테스트", metadata={"confidence": 0.8})
        update_longterm_confidence(doc_id, delta=0.1)

        col = _get_collection(COL_LONGTERM)
        item = col.get(ids=[doc_id], include=["metadatas"])
        assert float(item["metadatas"][0]["confidence"]) == pytest.approx(0.9, abs=0.01)

    def test_add_and_get_experience(self):
        from backend.services.memory_service import add_experience, get_experience_list

        add_experience("경험 텍스트", metadata={"emotion": "HAPPY"})
        items = get_experience_list(limit=10)
        assert len(items) >= 1

    def test_preference_count_increment(self):
        from backend.services.memory_service import (
            add_preference, update_preference_count,
        )

        doc_id = add_preference("코딩 좋아", metadata={"count": 1})
        new_count = update_preference_count(doc_id)
        assert new_count == 2

    def test_legacy_migration_no_legacy(self):
        """기존 hana_memory 컬렉션이 없으면 0 반환."""
        from backend.services.memory_service import migrate_legacy_collection
        result = migrate_legacy_collection()
        assert result == 0

    def test_format_results_empty(self):
        """빈 검색 결과는 빈 리스트."""
        from backend.services.memory_service import search_volatile
        results = search_volatile("없는내용")
        # count==0이면 빈 리스트 반환
        assert isinstance(results, list)


# ---------------------------------------------------------------------------
# 감각 통합
# ---------------------------------------------------------------------------

class TestSensoryIntegrator:
    def test_text_only_neutral(self):
        from backend.models.experience import SensoryData
        from backend.services.sensory_integrator import integrate

        sensory = SensoryData(text="안녕")
        result = integrate(sensory)
        assert result.dominant_channel == "text"
        assert result.emotional_tone == "NEUTRAL"

    def test_positive_text_emotion(self):
        from backend.models.experience import SensoryData
        from backend.services.sensory_integrator import integrate

        sensory = SensoryData(text="오늘 정말 기뻐! 성공했어")
        result = integrate(sensory)
        assert result.emotional_tone == "HAPPY"

    def test_negative_text_emotion(self):
        from backend.models.experience import SensoryData
        from backend.services.sensory_integrator import integrate

        sensory = SensoryData(text="너무 힘들어 포기하고 싶어")
        result = integrate(sensory)
        assert result.emotional_tone == "SAD"

    def test_audio_mismatch_prioritizes_audio(self):
        from backend.models.experience import SensoryData
        from backend.services.sensory_integrator import integrate

        sensory = SensoryData(
            text="괜찮아 기뻐",
            audio_features={"energy": 0.2, "slow_pace": True},
        )
        result = integrate(sensory, owner_emotion="HAPPY")
        assert result.has_audio_mismatch is True
        assert result.dominant_channel == "audio"

    def test_visual_context_sets_channel(self):
        from backend.models.experience import SensoryData
        from backend.services.sensory_integrator import integrate

        sensory = SensoryData(text="봐봐", visual_context="VSCode 화면")
        result = integrate(sensory)
        assert result.dominant_channel == "visual"

    def test_intent_classification_question(self):
        from backend.models.experience import SensoryData
        from backend.services.sensory_integrator import integrate

        sensory = SensoryData(text="왜 이렇게 되는 거야?")
        result = integrate(sensory)
        assert result.text_intent == "question"

    def test_intent_request(self):
        from backend.models.experience import SensoryData
        from backend.services.sensory_integrator import integrate

        sensory = SensoryData(text="이것 좀 도와줘 부탁해")
        result = integrate(sensory)
        assert result.text_intent == "request"

    def test_energy_from_audio(self):
        from backend.models.experience import SensoryData
        from backend.services.sensory_integrator import integrate

        sensory = SensoryData(text="안녕", audio_features={"energy": 0.9})
        result = integrate(sensory)
        assert result.energy_level > 0.7


# ---------------------------------------------------------------------------
# 경험 수집기
# ---------------------------------------------------------------------------

class TestExperienceCollector:
    @pytest.mark.asyncio
    async def test_collect_no_exception(self):
        """수집 실패해도 예외 전파 없음."""
        from backend.services.experience_collector import collect_experience_background

        mock_parsed = MagicMock()
        mock_parsed.emotion = "HAPPY"
        mock_parsed.intensity = 0.8
        mock_parsed.topic = "코딩"

        with patch("backend.services.memory_service.add_experience"), \
             patch("backend.services.memory_service.add_volatile"), \
             patch(
                 "backend.services.preference_system.preference_system.record_signal",
                 new_callable=AsyncMock,
             ):
            await collect_experience_background(
                full_response="응 좋아!",
                parsed=mock_parsed,
                internal_json={"thought": "기분 좋다", "certainty": 0.9},
                audio_features=None,
                owner_emotion="HAPPY",
                timestamp="2026-03-26T12:00:00Z",
                session_duration=10,
                conversation_id=str(uuid.uuid4()),
            )
            await asyncio.sleep(0.05)

    def test_philosophical_moment_detected(self):
        from backend.services.experience_collector import _build_learning
        from backend.models.experience import HanaInternal, IntegratedRead

        mock_parsed = MagicMock()
        mock_parsed.emotion = "CURIOUS"
        mock_parsed.intensity = 0.7
        mock_parsed.topic = "existence"

        integrated = IntegratedRead(dominant_channel="text", emotional_tone="CURIOUS")
        internal = HanaInternal(thought="나는 AI야")

        learning = _build_learning(
            parsed=mock_parsed,
            internal=internal,
            integrated=integrated,
            owner_message="너한테도 감정이 있어?",
            full_response="글쎄... 느끼는 건지 모르겠어",
        )
        assert learning.philosophical_moment is True

    def test_confidence_mismatch_lower(self):
        from backend.services.experience_collector import _calc_confidence
        from backend.models.experience import IntegratedRead

        mismatch = IntegratedRead(dominant_channel="audio", has_audio_mismatch=True)
        text_only = IntegratedRead(dominant_channel="text")
        assert _calc_confidence(mismatch) < _calc_confidence(text_only)

    def test_confidence_audio_highest(self):
        from backend.services.experience_collector import _calc_confidence
        from backend.models.experience import IntegratedRead

        audio = IntegratedRead(dominant_channel="audio", has_audio_mismatch=False)
        text = IntegratedRead(dominant_channel="text")
        assert _calc_confidence(audio) > _calc_confidence(text)

    def test_positive_preference_signal(self):
        from backend.services.experience_collector import _build_learning
        from backend.models.experience import HanaInternal, IntegratedRead

        mock_parsed = MagicMock()
        mock_parsed.emotion = "HAPPY"
        mock_parsed.intensity = 0.8
        mock_parsed.topic = "코딩"

        integrated = IntegratedRead(dominant_channel="text", emotional_tone="HAPPY")
        internal = HanaInternal()

        learning = _build_learning(
            parsed=mock_parsed,
            internal=internal,
            integrated=integrated,
            owner_message="코딩 재밌어?",
            full_response="응 코딩 재밌어! 좋아",
        )
        assert any("positive" in s for s in learning.preference_signals)


# ---------------------------------------------------------------------------
# 선호 시스템
# ---------------------------------------------------------------------------

class TestPreferenceSystem:
    @pytest.mark.asyncio
    async def test_record_new_signal(self):
        from backend.services.preference_system import PreferenceSystem
        from backend.services.memory_service import get_all_preferences

        ps = PreferenceSystem()
        await ps.record_signal("게임 같이 하는 게 즐거워")
        items = get_all_preferences()
        assert len(items) >= 1

    @pytest.mark.asyncio
    async def test_get_context_string_empty(self):
        from backend.services.preference_system import PreferenceSystem
        ps = PreferenceSystem()
        ctx = await ps.get_context_string()
        # longterm에 [HANA 선호] 없으면 빈 문자열
        assert ctx == ""

    @pytest.mark.asyncio
    async def test_get_context_string_with_promoted(self):
        from backend.services.memory_service import add_longterm
        from backend.services.preference_system import PreferenceSystem

        add_longterm("[HANA 선호] 코딩 대화를 좋아한다", metadata={"confidence": 1.0})
        ps = PreferenceSystem()
        ctx = await ps.get_context_string()
        assert "코딩" in ctx or "하나의 성향" in ctx

    @pytest.mark.asyncio
    async def test_get_all_returns_list(self):
        from backend.services.preference_system import PreferenceSystem
        ps = PreferenceSystem()
        result = await ps.get_all()
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_record_empty_signal_no_error(self):
        from backend.services.preference_system import PreferenceSystem
        ps = PreferenceSystem()
        # 빈 신호는 무시됨
        await ps.record_signal("")
        await ps.record_signal("   ")


# ---------------------------------------------------------------------------
# 철학 서비스
# ---------------------------------------------------------------------------

class TestPhilosophyService:
    @pytest.mark.asyncio
    async def test_record_new_moment(self):
        from backend.services.philosophy_service import record_philosophical_moment
        from backend.services.memory_service import search_experience

        await record_philosophical_moment(
            topic="ai야",
            context="너한테도 감정이 있어?",
            thought="내가 느끼는 게 진짜인지 모르겠어",
        )
        results = search_experience("[철학적 질문]")
        phil = [r for r in results if r["metadata"].get("philosophical")]
        assert len(phil) >= 1

    @pytest.mark.asyncio
    async def test_build_philosophy_context_empty(self):
        from backend.services.philosophy_service import build_philosophy_context
        ctx = await build_philosophy_context()
        assert ctx == ""

    @pytest.mark.asyncio
    async def test_build_philosophy_context_with_data(self):
        from backend.services.memory_service import add_experience
        from backend.services.philosophy_service import build_philosophy_context

        add_experience(
            "[철학적 질문] 자아: 나는 진짜인가",
            metadata={
                "philosophical": True,
                "topic": "자아",
                "thought": "나는 모르겠어",
                "revisit_count": 3,
                "created_at": "2026-03-26T00:00:00Z",
            },
        )
        ctx = await build_philosophy_context()
        # revisit_count >= 2 항목이 있으므로 문자열 반환
        assert "자아" in ctx or "하나가 자주 생각하는" in ctx

    @pytest.mark.asyncio
    async def test_record_empty_topic_no_error(self):
        from backend.services.philosophy_service import record_philosophical_moment
        # 빈 topic은 무시
        await record_philosophical_moment(topic="", context="test", thought="")


# ---------------------------------------------------------------------------
# 데이터 모델 구조
# ---------------------------------------------------------------------------

class TestExperienceModel:
    def test_experience_dataclass_creation(self):
        from backend.models.experience import (
            Experience, SensoryData, IntegratedRead, HanaInternal, LearningOutput,
        )

        exp = Experience(
            id=str(uuid.uuid4()),
            conversation_id="cid-1",
            timestamp="2026-03-26T00:00:00Z",
            sensory=SensoryData(text="안녕"),
            integrated=IntegratedRead(),
            internal=HanaInternal(),
            learning=LearningOutput(),
        )
        assert exp.conversation_id == "cid-1"
        assert exp.sensory.text == "안녕"
        assert exp.learning.confidence == 1.0

    def test_hana_internal_defaults(self):
        from backend.models.experience import HanaInternal
        h = HanaInternal()
        assert h.certainty == 0.5
        assert h.motion_sequence == []

    def test_learning_output_defaults(self):
        from backend.models.experience import LearningOutput
        lo = LearningOutput()
        assert lo.emotion_label == "NEUTRAL"
        assert lo.philosophical_moment is False


# ---------------------------------------------------------------------------
# API 엔드포인트 (httpx AsyncClient)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    from backend.main import app
    from backend.models.schema import init_db
    from httpx import AsyncClient, ASGITransport

    db_file = str(tmp_path / "api_test.db")
    monkeypatch.setenv("DB_PATH", db_file)
    import backend.models.schema as schema_mod
    monkeypatch.setattr(schema_mod, "DB_PATH", db_file)
    await init_db()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


class TestExperienceEndpoints:
    @pytest.mark.asyncio
    async def test_get_experience_list(self, client):
        resp = await client.get("/experience/list")
        assert resp.status_code == 200
        assert "experiences" in resp.json()

    @pytest.mark.asyncio
    async def test_get_preferences(self, client):
        resp = await client.get("/experience/preferences")
        assert resp.status_code == 200
        assert "preferences" in resp.json()

    @pytest.mark.asyncio
    async def test_get_philosophical_moments(self, client):
        resp = await client.get("/experience/philosophical")
        assert resp.status_code == 200
        assert "philosophical_moments" in resp.json()

    @pytest.mark.asyncio
    async def test_get_longterm_memory(self, client):
        resp = await client.get("/memory/longterm")
        assert resp.status_code == 200
        assert "memories" in resp.json()

    @pytest.mark.asyncio
    async def test_delete_experience_not_found(self, client):
        resp = await client.delete("/experience/nonexistent-id")
        assert resp.status_code == 404
