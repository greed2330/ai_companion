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

      await this._playBlob(await response.blob(), params);
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

  async _playBlob(blob, params) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.current = audio;
      audio.onplay = () => {
        window.dispatchEvent(
          new CustomEvent("tts-start", {
            detail: { audio, params }
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
