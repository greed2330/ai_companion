/**
 * LipSyncService
 *
 * TTS 재생 중 mouth_open 값(0~1)을 계산해 BroadcastChannel("hana-overlay")로 전달한다.
 * CharacterOverlay.jsx가 lipsync_value 메시지를 받아 ParamMouthOpenY에 반영한다.
 *
 * 메인 경로 — startWithText(audio, text):
 *   viseme.js가 반환한 [{timeMs, openValue}] 타임라인을 audio.currentTime으로 추종한다.
 *   타이밍 전략 교체는 viseme.js에서만 이루어지고 이 파일은 변경 불필요.
 *
 * Fallback 경로 — start(audio):
 *   오디오 주파수 진폭 분석. SpeechSynthesis 에러 시 사인파 시뮬레이션.
 */

import { buildVisemeSchedule } from "./viseme";

const _channel = new BroadcastChannel("hana-overlay");

export class LipSyncService {
  constructor() {
    this.analyzer = null;
    this.frame = null;
    this.ctx = null;
    this._schedule = null;
  }

  // 텍스트 기반 립싱크 (메인 경로)
  startWithText(audio, text) {
    this.stop();

    if (!audio) {
      this._dummy();
      return;
    }

    const _run = () => {
      const dur = audio.duration;
      const durationMs = (Number.isFinite(dur) && dur > 0) ? dur * 1000 : null;

      if (!durationMs) {
        // duration을 아직 모름 → amplitude fallback으로 대체
        this.start(audio);
        return;
      }

      this._schedule = buildVisemeSchedule(text, durationMs);
      if (!this._schedule.length) {
        this.start(audio);
        return;
      }
      this._runSchedule(audio);
    };

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      // loadedmetadata가 이미 발화된 상태 (tts.js가 보장함)
      _run();
    } else {
      // 혹시라도 duration이 아직 없으면 loadedmetadata를 기다림
      audio.addEventListener("loadedmetadata", _run, { once: true });
    }
  }

  // viseme 타임라인 추종 rAF 루프
  _runSchedule(audio) {
    let frameIdx = 0;
    const schedule = this._schedule;

    const tick = () => {
      if (!audio || audio.ended || audio.paused) {
        if (audio?.ended) {
          _channel.postMessage({ type: "lipsync_value", value: 0 });
          this.frame = null;
        } else {
          // paused 상태면 계속 폴링 (resume 대기)
          this.frame = requestAnimationFrame(tick);
        }
        return;
      }

      const currentMs = audio.currentTime * 1000;

      while (frameIdx < schedule.length - 1 && schedule[frameIdx + 1].timeMs <= currentMs) {
        frameIdx++;
      }

      const curr = schedule[frameIdx];
      const next = schedule[frameIdx + 1];
      let value = curr.openValue;

      if (next) {
        const span = next.timeMs - curr.timeMs;
        if (span > 0) {
          const t = Math.min(1, Math.max(0, (currentMs - curr.timeMs) / span));
          value = curr.openValue + (next.openValue - curr.openValue) * t;
        }
      }

      // 타임라인 끝을 지나면 입 닫음
      if (frameIdx >= schedule.length - 1 && currentMs >= schedule[schedule.length - 1].timeMs) {
        value = 0;
      }

      _channel.postMessage({ type: "lipsync_value", value: Math.max(0, Math.min(1, value)) });
      this.frame = requestAnimationFrame(tick);
    };

    this.frame = requestAnimationFrame(tick);
  }

  // 진폭 분석 기반 립싱크 (amplitude fallback 경로)
  start(audio) {
    this.stop();

    if (!audio) {
      this._dummy();
      return;
    }

    this.ctx = new AudioContext();
    const src = this.ctx.createMediaElementSource(audio);
    this.analyzer = this.ctx.createAnalyser();
    this.analyzer.fftSize = 256;
    src.connect(this.analyzer);
    this.analyzer.connect(this.ctx.destination);
    this._animate();
  }

  _animate() {
    const data = new Uint8Array(this.analyzer.frequencyBinCount);
    const tick = () => {
      this.analyzer.getByteFrequencyData(data);
      // 음성 주파수 핵심 대역 (bins 3~30 ≈ 280Hz~2800Hz)
      const slice = data.subarray(3, 30);
      let sum = 0;
      for (let i = 0; i < slice.length; i++) sum += slice[i];
      const average = sum / slice.length;
      const value = Math.min(1, average / 64);
      _channel.postMessage({ type: "lipsync_value", value });
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  _dummy() {
    // SpeechSynthesis 에러 경로: 사인파로 입 움직임 시뮬레이션
    let time = 0;
    const tick = () => {
      const value = Math.abs(Math.sin(time * 8)) * 0.6;
      _channel.postMessage({ type: "lipsync_value", value });
      time += 0.016;
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.ctx?.close?.();
    this.ctx = null;
    this.analyzer = null;
    this._schedule = null;
    _channel.postMessage({ type: "lipsync_value", value: 0 });
  }
}

export const lipSyncService = new LipSyncService();

window.addEventListener("tts-start", (event) => {
  const { audio, text } = event.detail || {};
  if (text && text.trim()) {
    lipSyncService.startWithText(audio, text);
  } else {
    lipSyncService.start(audio);
  }
});

window.addEventListener("tts-end", () => {
  lipSyncService.stop();
});
