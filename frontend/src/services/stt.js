import { buildApiUrl } from "./api";

export class STTService {
  constructor() {
    this.isRecording = false;
    this.recorder = null;
    this.chunks = [];
    this.ctx = null;
    this.stream = null;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    this.stream = stream;
    this.ctx = new AudioContext({ sampleRate: 16000 });
    this.recorder = new MediaRecorder(stream);
    this.chunks = [];
    this.isRecording = true;
    this.recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.recorder.start(100);
  }

  async stop() {
    if (!this.recorder) {
      return { text: "", audio_features: null };
    }

    return new Promise((resolve) => {
      this.recorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: "audio/wav" });
        const result = await this._transcribe(blob);
        this.stream?.getTracks?.().forEach((track) => track.stop());
        this.stream = null;
        resolve(result);
      };

      this.recorder.stop();
      this.isRecording = false;
    });
  }

  async _transcribe(blob) {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "rec.wav");
      const response = await fetch(buildApiUrl("/voice/stt"), {
        method: "POST",
        body: formData
      });

      if (response.ok) {
        const payload = await response.json();
        return {
          text: payload.text || "",
          audio_features: await this._features(blob)
        };
      }
    } catch {}

    return new Promise((resolve) => {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        resolve({ text: "", audio_features: null });
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "ko-KR";
      recognition.onresult = (event) =>
        resolve({
          text: event.results?.[0]?.[0]?.transcript || "",
          audio_features: null
        });
      recognition.onerror = () => resolve({ text: "", audio_features: null });
      recognition.start();
    });
  }

  async _features(blob) {
    try {
      const buffer = await blob.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(buffer);
      const data = audioBuffer.getChannelData(0);
      const rms = Math.sqrt(
        data.reduce((sum, value) => sum + value * value, 0) / data.length
      );
      const silence = data.filter((value) => Math.abs(value) < 0.01).length;
      const last = data.slice(-Math.floor(audioBuffer.sampleRate * 0.5));
      const lastRms = Math.sqrt(
        last.reduce((sum, value) => sum + value * value, 0) / Math.max(last.length, 1)
      );

      return {
        energy: Math.min(1, rms * 10),
        speech_rate: 1 - silence / data.length,
        rising_tone: lastRms > rms * 1.2
      };
    } catch {
      return null;
    }
  }
}

export const sttService = new STTService();
