export class LipSyncService {
  constructor() {
    this.analyzer = null;
    this.frame = null;
    this.renderer = null;
    this.ctx = null;
  }

  start(audio, renderer) {
    this.stop();
    this.renderer = renderer;

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
      const slice = Array.from(data.slice(3, 30));
      const average =
        slice.reduce((sum, value) => sum + value, 0) / Math.max(slice.length, 1);
      this.renderer?.setAbstractParam("mouth_open", Math.min(1, average / 128));
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  _dummy() {
    let time = 0;
    const tick = () => {
      this.renderer?.setAbstractParam("mouth_open", Math.abs(Math.sin(time * 8)) * 0.6);
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
    this.renderer?.setAbstractParam("mouth_open", 0);
  }
}

export const lipSyncService = new LipSyncService();

window.addEventListener("tts-start", (event) => {
  const renderer = window.__characterRenderer;
  if (renderer) {
    lipSyncService.start(event.detail?.audio, renderer);
  }
});

window.addEventListener("tts-end", () => {
  lipSyncService.stop();
});
