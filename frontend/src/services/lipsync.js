/**
 * LipSyncService
 *
 * TTS 오디오를 분석해서 mouth_open 값(0~1)을 계산하고,
 * BroadcastChannel("hana-overlay")로 캐릭터 창에 전달한다.
 *
 * 캐릭터 오버레이가 별도 BrowserWindow이기 때문에
 * window.__characterRenderer 직접 호출은 불가능하다.
 * CharacterOverlay.jsx가 lipsync_value 메시지를 받아서 처리한다.
 */

const _channel = new BroadcastChannel("hana-overlay");

export class LipSyncService {
  constructor() {
    this.analyzer = null;
    this.frame = null;
    this.ctx = null;
  }

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
      // 0~255 → 0~1. 실제 음성은 average가 보통 10~60 사이이므로 64로 나눠 감도 높임
      const value = Math.min(1, average / 64);
      _channel.postMessage({ type: "lipsync_value", value });
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  _dummy() {
    // Fallback (SpeechSynthesis 사용 시): 사인파로 입 움직임 시뮬레이션
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
    _channel.postMessage({ type: "lipsync_value", value: 0 });
  }
}

export const lipSyncService = new LipSyncService();

window.addEventListener("tts-start", (event) => {
  lipSyncService.start(event.detail?.audio);
});

window.addEventListener("tts-end", () => {
  lipSyncService.stop();
});
