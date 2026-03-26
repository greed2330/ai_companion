/**
 * 캐릭터 렌더러.
 * Live2D (pixi-live2d-display) 전담. PMX 코드는 유지하되 Live2D에 집중.
 *
 * mood 적용 순서:
 *   1. model.expression() — 모델에 매칭 expression 있으면 사용 (자연스러운 표정 전환)
 *   2. 파라미터 직접 조작 — expression 없는 모델의 fallback
 */

// mood별 raw 파라미터 (fallback용)
const MOOD_PARAMS = {
  live2d: {
    IDLE:      { ParamEyeOpen: 1.0,  ParamMouthOpenY: 0,    ParamBodyAngleX: 0  },
    HAPPY:     { ParamEyeOpen: 0.6,  ParamMouthOpenY: 0.8,  ParamBodyAngleX: 5  },
    CONCERNED: { ParamEyeOpen: 1.0,  ParamMouthOpenY: 0.2,  ParamBodyAngleX: -3 },
    FOCUSED:   { ParamEyeOpen: 1.0,  ParamMouthOpenY: 0,    ParamBodyAngleX: 0  },
    CURIOUS:   { ParamEyeOpen: 1.2,  ParamMouthOpenY: 0.1,  ParamBodyAngleX: 10 },
    GAMING:    { ParamEyeOpen: 1.2,  ParamMouthOpenY: 0.5,  ParamBodyAngleX: 8  },
    SLEEPY:    { ParamEyeOpen: 0.45, ParamMouthOpenY: 0.05, ParamBodyAngleX: -4 }
  },
  pmx: {
    IDLE:      { morphs: [] },
    HAPPY:     { morphs: [{ name: "\u7b11\u3044", weight: 0.8 }, { name: "\u3042", weight: 0.3 }] },
    CONCERNED: { morphs: [{ name: "\u56f0\u308b", weight: 0.7 }] },
    FOCUSED:   { morphs: [] },
    CURIOUS:   { morphs: [{ name: "\u9a5a\u304d", weight: 0.5 }] },
    GAMING:    { morphs: [{ name: "\u7b11\u3044", weight: 0.6 }, { name: "\u3042", weight: 0.5 }] },
    SLEEPY:    { morphs: [{ name: "\u56f0\u308b", weight: 0.35 }] }
  }
};

/**
 * 각 mood에서 시도할 expression ID 후보 목록 (소문자 정규화 후 비교).
 * 모델마다 이름이 다르므로 여러 후보를 순서대로 탐색한다.
 */
const MOOD_EXPRESSION_CANDIDATES = {
  IDLE:      ["normal", "default", "neutral", "idle", "f_normal", "f00"],
  HAPPY:     ["happy", "smile", "joy", "excited", "f_happy", "笑い", "f01"],
  CONCERNED: ["concerned", "sad", "worry", "troubled", "f_sad", "困る", "f02"],
  FOCUSED:   ["focused", "serious", "think", "concentrate", "真剣", "f03"],
  CURIOUS:   ["curious", "surprise", "wonder", "surprised", "驚き", "f04"],
  GAMING:    ["excited", "happy", "joy", "energetic", "f_excited", "f05"],
  SLEEPY:    ["sleepy", "tired", "drowsy", "眠い", "f06"]
};

export function detectModelType(modelPath) {
  if (modelPath?.endsWith(".model3.json")) return "live2d";
  if (modelPath?.endsWith(".pmx")) return "pmx";
  return null;
}

// ---------------------------------------------------------------------------
// Live2D expression 탐색
// ---------------------------------------------------------------------------

/**
 * 로드된 Live2D 모델에서 사용 가능한 expression ID 목록을 반환한다.
 * pixi-live2d-display 내부 구조를 통해 접근.
 */
function getModelExpressionIds(model) {
  try {
    const mgr = model?.internalModel?.motionManager?.expressionManager;
    if (!mgr) return [];

    // pixi-live2d-display 버전에 따라 구조가 다를 수 있음
    const defs =
      mgr._definitions ||          // v0.3.x
      mgr.definitions ||            // v0.4.x+
      [];

    return defs.map((d) => (d.Name || d.name || "").toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * mood에 맞는 expression ID를 찾는다.
 * 모델이 가진 expression 목록과 MOOD_EXPRESSION_CANDIDATES를 교차 탐색.
 */
function findExpressionId(availableIds, mood) {
  if (!availableIds.length) return null;
  const candidates = MOOD_EXPRESSION_CANDIDATES[mood] || [];
  for (const candidate of candidates) {
    const match = availableIds.find((id) => id.includes(candidate));
    if (match) return match;
  }
  return null;
}

// ---------------------------------------------------------------------------
// mood 적용
// ---------------------------------------------------------------------------

function applyLive2dMood(instance, mood) {
  const model = instance.model;
  if (!model) return;

  // 1단계: expression API 시도
  const expressionId = findExpressionId(instance.expressionIds || [], mood);
  if (expressionId) {
    try {
      model.expression(expressionId);
      return;
    } catch {
      // expression 실패 → raw parameter fallback
    }
  }

  // 2단계: raw 파라미터 조작 (fallback)
  const params = MOOD_PARAMS.live2d[mood] || MOOD_PARAMS.live2d.IDLE;
  const coreModel = model?.internalModel?.coreModel;
  if (!coreModel) return;

  Object.entries(params).forEach(([parameterId, value]) => {
    try {
      coreModel.setParameterValueById(parameterId, value);
    } catch {
      // 파라미터 미존재 모델 무시
    }
  });
}

function applyPmxMood(mesh, mood) {
  const params = MOOD_PARAMS.pmx[mood] || MOOD_PARAMS.pmx.IDLE;
  const dictionary = mesh?.morphTargetDictionary;
  const influences = mesh?.morphTargetInfluences;
  if (!dictionary || !influences) return;

  influences.fill(0);
  params.morphs.forEach(({ name, weight }) => {
    const index = dictionary[name];
    if (typeof index === "number") influences[index] = weight;
  });
}

// ---------------------------------------------------------------------------
// Live2D 로드
// ---------------------------------------------------------------------------

function fitLive2dModel(model, container) {
  const bounds = model.getLocalBounds();
  const targetWidth  = Math.max(container.clientWidth  * 0.78, 1);
  const targetHeight = Math.max(container.clientHeight * 0.9, 1);
  const scale = Math.min(
    targetWidth  / Math.max(bounds.width,  1),
    targetHeight / Math.max(bounds.height, 1)
  );

  model.scale.set(scale);
  model.x = container.clientWidth  / 2 - (bounds.x + bounds.width  / 2) * scale;
  model.y = container.clientHeight     - (bounds.y + bounds.height) * scale;
}

let cubismCorePromise = null;

async function ensureLive2dCubismCore(resolveAssetUrl) {
  if (window.Live2DCubismCore) return;

  if (!cubismCorePromise) {
    cubismCorePromise = (async () => {
      const candidate = "assets/live2d/live2dcubismcore.min.js";
      const assetUrl = await resolveAssetUrl(candidate);
      if (!assetUrl) {
        throw new Error("Live2D Cubism Core not found. Put live2dcubismcore.min.js in assets/live2d/.");
      }

      await new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-live2d-core="${candidate}"]`);
        if (existing) {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = assetUrl;
        script.async = true;
        script.dataset.live2dCore = candidate;
        script.onload  = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load Live2D core: ${candidate}`));
        document.head.appendChild(script);
      });

      if (!window.Live2DCubismCore) {
        throw new Error("Live2D Cubism Core loaded but Live2DCubismCore not found on window.");
      }
    })();
  }

  return cubismCorePromise;
}

async function loadLive2dModel(container, modelUrl) {
  const PIXI = await import("pixi.js");
  window.PIXI = PIXI;
  await ensureLive2dCubismCore(async (relativePath) =>
    window.hanaDesktop?.resolveAssetUrl?.(relativePath) || ""
  );
  const { Live2DModel } = await import("pixi-live2d-display/cubism4");
  Live2DModel.registerTicker(PIXI.Ticker);

  const app = new PIXI.Application({
    width:           container.clientWidth,
    height:          container.clientHeight,
    antialias:       true,
    autoStart:       true,
    backgroundAlpha: 0
  });
  app.renderer.resize(container.clientWidth, container.clientHeight);
  container.appendChild(app.view);

  const model = await Live2DModel.from(modelUrl);
  app.stage.addChild(model);
  fitLive2dModel(model, container);

  // expression 목록을 인스턴스에 캐시
  const expressionIds = getModelExpressionIds(model);

  // Idle 모션 자동 시작 (모델에 'Idle' 그룹이 있을 때)
  try {
    model.motion("Idle", 0);
  } catch {
    // Idle 모션 없는 모델은 무시
  }

  const resize = () => {
    app.renderer.resize(container.clientWidth, container.clientHeight);
    fitLive2dModel(model, container);
  };
  const resizeObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);

  return {
    type: "live2d",
    model,
    expressionIds,
    cleanup() {
      resizeObserver?.disconnect();
      app.destroy(true, true);
      delete window.PIXI;
    }
  };
}

// ---------------------------------------------------------------------------
// PMX 로드 (기존 유지)
// ---------------------------------------------------------------------------

function fitPmxModel(mesh, camera, container, THREE) {
  const box    = new THREE.Box3().setFromObject(mesh);
  const size   = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largest   = Math.max(size.x, size.y, size.z, 1);
  const distance  = largest * 1.55;

  mesh.position.sub(center);
  mesh.rotation.y = 0;
  camera.position.set(0, largest * 0.12, distance);
  camera.lookAt(0, largest * 0.08, 0);
}

async function loadPmxModel(container, modelUrl) {
  const [THREE, { MMDLoader }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/MMDLoader.js")
  ]);

  const scene    = new THREE.Scene();
  const camera   = new THREE.PerspectiveCamera(
    35,
    Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
    0.1,
    2000
  );
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(0, 1, 1);
  scene.add(keyLight);

  const loader = new MMDLoader();
  const mesh   = await new Promise((resolve, reject) => {
    loader.load(modelUrl, resolve, undefined, reject);
  });

  scene.add(mesh);
  fitPmxModel(mesh, camera, container, THREE);

  let animationFrameId = 0;
  const render = () => {
    renderer.render(scene, camera);
    animationFrameId = window.requestAnimationFrame(render);
  };
  render();

  const resize = () => {
    camera.aspect =
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.render(scene, camera);
  };
  const resizeObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);

  return {
    type: "pmx",
    model: mesh,
    cleanup() {
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      scene.clear();
    }
  };
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

export async function loadCharacterModel(container, modelPath, resolveAssetUrl) {
  const type     = detectModelType(modelPath);
  const modelUrl = await resolveAssetUrl(modelPath);
  if (!type || !modelUrl) return null;

  if (type === "live2d") return loadLive2dModel(container, modelUrl);
  if (type === "pmx")    return loadPmxModel(container, modelUrl);
  return null;
}

export function applyMood(instance, mood) {
  if (!instance) return;
  if (instance.type === "live2d") applyLive2dMood(instance, mood);
  if (instance.type === "pmx")    applyPmxMood(instance.model, mood);
}

export function applyGaze(instance, x, y) {
  if (!instance) return;

  if (instance.type === "live2d") {
    const coreModel = instance.model?.internalModel?.coreModel;
    if (!coreModel) return;
    try {
      coreModel.setParameterValueById("ParamEyeBallX", x);
      coreModel.setParameterValueById("ParamEyeBallY", -y);
    } catch {
      // 파라미터 미지원 모델 무시
    }
  }

  if (instance.type === "pmx") {
    instance.model.rotation.x = y * 0.3;
    instance.model.rotation.y = x * 0.3;
  }
}
