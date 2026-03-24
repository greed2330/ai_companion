import { buildApiUrl } from "./api";

function clamp(value, range = {}) {
  const min = range.min ?? value;
  const max = range.max ?? value;
  return Math.max(min, Math.min(max, value));
}

export class CharacterController {
  constructor() {
    this.renderer = null;
    this.modelType = null;
    this.abstractMapping = {};
    this.paramRanges = {};
    this.currentValues = {};
    this._breathFrame = null;
    this._silentFrame = null;
    this._silentMode = false;
  }

  async init(renderer, modelId) {
    this.detach();
    this.renderer = renderer;
    window.__characterRenderer = this;
    await this._loadContext(modelId);
    this.startIdleBreathing();
  }

  detach() {
    if (this._breathFrame) {
      cancelAnimationFrame(this._breathFrame);
      this._breathFrame = null;
    }

    if (this._silentFrame) {
      cancelAnimationFrame(this._silentFrame);
      this._silentFrame = null;
    }

    this._silentMode = false;
    if (window.__characterRenderer === this) {
      delete window.__characterRenderer;
    }
    this.renderer = null;
  }

  async _loadContext(modelId) {
    try {
      const response = await fetch(buildApiUrl("/settings/models/current-context"));
      const payload = await response.json();
      this.modelType = payload.model_type || this.renderer?.type || "live2d";
      this.abstractMapping = payload.abstract_mapping || {};
      this.paramRanges = payload.param_ranges || {};
      if (!Object.keys(this.abstractMapping).length) {
        this._defaultMapping(modelId);
      }
    } catch {
      this._defaultMapping(modelId);
    }
  }

  _defaultMapping() {
    this.modelType = this.renderer?.type || "live2d";
    this.abstractMapping = {
      head_x: "ParamAngleX",
      head_y: "ParamAngleY",
      head_z: "ParamAngleZ",
      eye_open: "ParamEyeLOpen",
      brow_l: "ParamBrowLY",
      brow_r: "ParamBrowRY",
      smile: "ParamMouthForm",
      mouth_open: "ParamMouthOpenY",
      body_x: "ParamBodyAngleX",
      body_y: "__bodyY",
      gaze_x: "ParamEyeBallX",
      gaze_y: "ParamEyeBallY",
      sweat: "__sweat",
      blush: "__blush"
    };
    this.paramRanges = {
      ParamAngleX: { min: -30, max: 30, default: 0 },
      ParamAngleY: { min: -20, max: 20, default: 0 },
      ParamAngleZ: { min: -30, max: 30, default: 0 },
      ParamEyeLOpen: { min: 0, max: 1, default: 1 },
      ParamBrowLY: { min: -1, max: 1, default: 0 },
      ParamBrowRY: { min: -1, max: 1, default: 0 },
      ParamMouthForm: { min: -1, max: 1, default: 0 },
      ParamMouthOpenY: { min: 0, max: 1, default: 0 },
      ParamBodyAngleX: { min: -10, max: 10, default: 0 },
      ParamEyeBallX: { min: -1, max: 1, default: 0 },
      ParamEyeBallY: { min: -1, max: 1, default: 0 },
      __bodyY: { min: -0.1, max: 0.1, default: 0 }
    };
  }

  setAbstractParam(name, value) {
    const actual = this.abstractMapping[name];
    if (!actual) {
      return;
    }

    const nextValue = clamp(value, this.paramRanges[actual]);
    this.currentValues[actual] = nextValue;
    this._apply(actual, nextValue);
  }

  _apply(param, value) {
    if (!this.renderer) {
      return;
    }

    try {
      if (param === "__bodyY") {
        if (this.renderer.type === "pmx" && this.renderer.model?.position) {
          this.renderer.model.position.y = value;
        }
        return;
      }

      if (this.renderer.type === "live2d") {
        this.renderer.model?.internalModel?.coreModel?.setParameterValueById(param, value);
        return;
      }

      if (this.renderer.type === "pmx") {
        const dictionary = this.renderer.model?.morphTargetDictionary || {};
        const index = dictionary[param];
        if (index !== undefined) {
          this.renderer.model.morphTargetInfluences[index] = value;
          return;
        }

        const bone = this.renderer.skeleton?.getBoneByName?.(param);
        if (bone) {
          bone.rotation.x = value * (Math.PI / 180);
          bone.updateMatrixWorld(true);
        }
      }
    } catch {}
  }

  async playMotionSequence(sequence, tensionLevel = 1) {
    if (!Array.isArray(sequence)) {
      return;
    }

    await Promise.all(
      sequence.map(async (step) => {
        const actual = this.abstractMapping[step.abstract];
        if (!actual) {
          return;
        }

        if (step.delay) {
          await new Promise((resolve) => window.setTimeout(resolve, step.delay));
        }

        const range = this.paramRanges[actual] || {};
        const target = clamp((step.value ?? 0) * tensionLevel, range);

        for (let index = 0; index < (step.repeat || 1); index += 1) {
          await this._tween(
            step.abstract,
            target,
            step.duration || 300,
            step.easing || "ease_out"
          );

          if (step.repeat > 1 && step.return_to_default) {
            await this._tween(
              step.abstract,
              range.default ?? 0,
              Math.round((step.duration || 300) * 0.7),
              "ease_in"
            );
          }
        }
      })
    );
  }

  async _tween(name, target, duration, easing = "ease_out") {
    const actual = this.abstractMapping[name];
    if (!actual) {
      return;
    }

    const start = this.currentValues[actual] ?? this.paramRanges[actual]?.default ?? 0;
    const startedAt = performance.now();

    return new Promise((resolve) => {
      const tick = (now) => {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased =
          easing === "ease_out"
            ? 1 - (1 - progress) ** 2
            : easing === "ease_in"
              ? progress ** 2
              : easing === "bounce"
                ? progress < 0.5
                  ? 4 * progress ** 3
                  : 1 - (-2 * progress + 2) ** 3 / 2
                : progress;

        this.setAbstractParam(name, start + (target - start) * eased);
        if (progress < 1) {
          requestAnimationFrame(tick);
          return;
        }
        resolve();
      };

      requestAnimationFrame(tick);
    });
  }

  async returnToDefault(duration = 800) {
    await Promise.all(
      Object.entries(this.abstractMapping).map(async ([abstractName, actualName]) => {
        const defaultValue = this.paramRanges[actualName]?.default ?? 0;
        const currentValue = this.currentValues[actualName] ?? defaultValue;
        if (Math.abs(currentValue - defaultValue) > 0.01) {
          await this._tween(abstractName, defaultValue, duration, "ease_out");
        }
      })
    );
  }

  startIdleBreathing() {
    if (this._breathFrame) {
      cancelAnimationFrame(this._breathFrame);
      this._breathFrame = null;
    }

    if (this.renderer?.type === "live2d") {
      return;
    }

    let time = 0;
    const tick = () => {
      this.setAbstractParam("body_y", Math.sin(time * 0.8) * 0.03);
      time += 0.016;
      this._breathFrame = requestAnimationFrame(tick);
    };
    this._breathFrame = requestAnimationFrame(tick);
  }

  enterSilentPresence() {
    if (this._silentMode) {
      return;
    }

    this._silentMode = true;
    if (this._breathFrame) {
      cancelAnimationFrame(this._breathFrame);
      this._breathFrame = null;
    }

    let time = 0;
    const tick = () => {
      if (!this._silentMode) {
        return;
      }

      this.setAbstractParam("body_y", Math.sin(time * 0.4) * 0.015);
      this.setAbstractParam("eye_open", 0.85 + Math.sin(time * 0.3) * 0.05);
      this.setAbstractParam("gaze_x", Math.sin(time * 0.15) * 0.05);
      time += 0.016;
      this._silentFrame = requestAnimationFrame(tick);
    };

    this._silentFrame = requestAnimationFrame(tick);
    this._tween("eye_open", 0.85, 600, "ease_out");
    this._tween("head_y", -1, 800, "ease_out");
  }

  exitSilentPresence() {
    if (!this._silentMode) {
      return;
    }

    this._silentMode = false;
    if (this._silentFrame) {
      cancelAnimationFrame(this._silentFrame);
      this._silentFrame = null;
    }

    this._tween("eye_open", 1, 400, "ease_out");
    this._tween("head_y", 0, 400, "ease_out");
    this.startIdleBreathing();
  }

  showOverlayEffect(type, duration = 1500) {
    const icons = {
      question_mark: "❔",
      exclamation: "❕",
      sweat: "💧",
      heart: "💕",
      music: "🎵",
      sparkle: "✨"
    };
    const icon = icons[type];
    if (!icon) {
      return;
    }

    const element = document.createElement("div");
    element.textContent = icon;
    element.className = "character-overlay-effect";
    element.style.animationDuration = `${duration}ms`;
    const character = document.querySelector(".character-stage");
    if (character) {
      const rect = character.getBoundingClientRect();
      element.style.left = `${rect.right - 40}px`;
      element.style.top = `${rect.top + 20}px`;
    }
    document.body.appendChild(element);
    window.setTimeout(() => element.remove(), duration);
  }
}

export const characterController = new CharacterController();
