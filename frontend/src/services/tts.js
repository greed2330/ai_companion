import { buildApiUrl } from "./api";

export class TTSService {
  constructor() {
    this.playing = false;
    this.queue = [];
    this.current = null;
  }

  async speak(text, params = {}) {
    if (this.playing) {
      this.queue.push({ text, params });
      return;
    }

    this.playing = true;

    try {
      const response = await fetch(buildApiUrl("/voice/tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          speed: params.speed || 1,
          pitch: params.pitch || 1,
          energy: params.energy || 1,
          hint: params.hint || ""
        })
      });

      if (!response.ok) {
        throw new Error("TTS unavailable");
      }

      await this._playBlob(await response.blob(), text, params);
    } catch {
      await this._fallback(text, params);
    } finally {
      this.playing = false;
      if (this.queue.length) {
        const next = this.queue.shift();
        this.speak(next.text, next.params);
      }
    }
  }

  async _playBlob(blob, text, params = {}) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.current = audio;
      audio.onplay = () => {
        window.dispatchEvent(
          new CustomEvent("tts-start", {
            detail: { audio, text, params }
          })
        );
      };
      audio.onended = () => {
        URL.revokeObjectURL(url);
        window.dispatchEvent(new CustomEvent("tts-end"));
        resolve();
      };
      audio.play();
    });
  }

  async _fallback(text, params) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ko-KR";
      utterance.rate = params.speed || 1;
      utterance.pitch = params.pitch || 1;
      utterance.volume = params.energy || 1;
      utterance.onstart = () => {
        window.dispatchEvent(
          new CustomEvent("tts-start", {
            detail: { audio: null, params }
          })
        );
      };
      utterance.onend = () => {
        window.dispatchEvent(new CustomEvent("tts-end"));
        resolve();
      };
      speechSynthesis.speak(utterance);
    });
  }

  stop() {
    this.queue = [];
    this.current?.pause?.();
    this.current = null;
    speechSynthesis.cancel();
    window.dispatchEvent(new CustomEvent("tts-end"));
  }
}

export const ttsService = new TTSService();

// ---------------------------------------------------------------------------
// TTS 엔진/목소리 관리 API
// ---------------------------------------------------------------------------

async function _readJson(resp, errMsg) {
  if (!resp.ok) throw new Error(errMsg);
  return resp.json();
}

export async function fetchTTSEngines() {
  return _readJson(await fetch(buildApiUrl("/voice/tts/engines")), "엔진 목록 로드 실패");
}

export async function fetchTTSVoices(engineId) {
  const q = engineId ? `?engine_id=${encodeURIComponent(engineId)}` : "";
  return _readJson(await fetch(buildApiUrl(`/voice/tts/voices${q}`)), "목소리 목록 로드 실패");
}

export async function selectTTSEngine(engineId, voiceId) {
  return _readJson(
    await fetch(buildApiUrl("/voice/tts/engines/select"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine_id: engineId, ...(voiceId ? { voice_id: voiceId } : {}) }),
    }),
    "엔진 변경 실패"
  );
}

export async function previewTTSVoice(voiceId, engineId) {
  const resp = await fetch(buildApiUrl("/voice/tts/preview"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voice_id: voiceId,
      engine_id: engineId,
      text: "안녕! 나 하나야. 잘 지냈어?",
    }),
  });
  if (!resp.ok) throw new Error("미리듣기 실패");
  return resp.blob();
}

export async function uploadTTSVoice(formData) {
  const resp = await fetch(buildApiUrl("/voice/tts/voices/upload"), {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) throw new Error("업로드 실패");
  return resp.json();
}

export async function deleteTTSVoice(voiceId) {
  const resp = await fetch(
    buildApiUrl(`/voice/tts/voices/${encodeURIComponent(voiceId)}`),
    { method: "DELETE" }
  );
  if (!resp.ok) throw new Error("삭제 실패");
  return resp.json();
}
