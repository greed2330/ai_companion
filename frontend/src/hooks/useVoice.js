import { useState, useEffect, useRef } from "react";
import {
  fetchTTSEngines,
  fetchTTSVoices,
  selectTTSEngine,
  previewTTSVoice,
  uploadTTSVoice,
  deleteTTSVoice,
} from "../services/tts";

/**
 * TTS 엔진/목소리 선택 상태를 관리하는 훅.
 * VoicePanel에서 사용.
 */
export function useVoice() {
  const [engines, setEngines] = useState([]);
  const [voices, setVoices] = useState([]);
  const [currentEngineId, setCurrentEngineId] = useState("edge_tts");
  const [currentVoiceId, setCurrentVoiceId] = useState("ko-KR-SunHiNeural");
  // previewState: { voiceId: string|null, status: "idle"|"loading"|"playing"|"error" }
  const [previewState, setPreviewState] = useState({ voiceId: null, status: "idle" });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    loadEngines();
  }, []);

  useEffect(() => {
    if (currentEngineId) loadVoices(currentEngineId);
  }, [currentEngineId]);

  async function loadEngines() {
    try {
      const data = await fetchTTSEngines();
      setEngines(data.engines || []);
      if (data.current_engine_id) setCurrentEngineId(data.current_engine_id);
      if (data.current_voice_id) setCurrentVoiceId(data.current_voice_id);
    } catch {
      // 백엔드 미실행 시 조용히 무시
    }
  }

  async function loadVoices(engineId) {
    try {
      const data = await fetchTTSVoices(engineId);
      setVoices(data.voices || []);
    } catch {
      setVoices([]);
    }
  }

  async function selectEngine(engineId) {
    setLoading(true);
    try {
      const result = await selectTTSEngine(engineId);
      setCurrentEngineId(engineId);
      if (result.current_voice_id) setCurrentVoiceId(result.current_voice_id);
    } catch {
      // 에러 시 UI 변경 없음
    } finally {
      setLoading(false);
    }
  }

  async function selectVoice(voiceId) {
    try {
      await selectTTSEngine(currentEngineId, voiceId);
      setCurrentVoiceId(voiceId);
    } catch {
      // 에러 시 무시
    }
  }

  async function previewVoice(voiceId) {
    // 재생 중이면 정지 후 새 재생
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    if (previewState.status === "playing" && previewState.voiceId === voiceId) {
      setPreviewState({ voiceId: null, status: "idle" });
      return;
    }
    setPreviewState({ voiceId, status: "loading" });
    try {
      const blob = await previewTTSVoice(voiceId, currentEngineId);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setPreviewState({ voiceId, status: "playing" });
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setPreviewState({ voiceId: null, status: "idle" });
      };
      audio.play();
    } catch {
      setPreviewState({ voiceId, status: "error" });
      setTimeout(() => setPreviewState({ voiceId: null, status: "idle" }), 2000);
    }
  }

  function stopPreview() {
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    setPreviewState({ voiceId: null, status: "idle" });
  }

  async function uploadVoice(file, name) {
    const form = new FormData();
    form.append("audio", file);
    form.append("name", name);
    form.append("engine_id", "fish_speech");
    await uploadTTSVoice(form);
    await loadVoices("fish_speech");
    setUploadOpen(false);
  }

  async function deleteVoice(voiceId) {
    await deleteTTSVoice(voiceId);
    await loadVoices(currentEngineId);
  }

  return {
    engines,
    voices,
    currentEngineId,
    currentVoiceId,
    previewState,
    uploadOpen,
    setUploadOpen,
    loading,
    selectEngine,
    selectVoice,
    previewVoice,
    stopPreview,
    uploadVoice,
    deleteVoice,
  };
}
