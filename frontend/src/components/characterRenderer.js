const MOOD_PARAMS = {
  live2d: {
    IDLE: { ParamEyeOpen: 1.0, ParamMouthOpenY: 0, ParamBodyAngleX: 0 },
    HAPPY: { ParamEyeOpen: 0.6, ParamMouthOpenY: 0.8, ParamBodyAngleX: 5 },
    CONCERNED: { ParamEyeOpen: 1.0, ParamMouthOpenY: 0.2, ParamBodyAngleX: -3 },
    FOCUSED: { ParamEyeOpen: 1.0, ParamMouthOpenY: 0, ParamBodyAngleX: 0 },
    CURIOUS: { ParamEyeOpen: 1.2, ParamMouthOpenY: 0.1, ParamBodyAngleX: 10 },
    GAMING: { ParamEyeOpen: 1.2, ParamMouthOpenY: 0.5, ParamBodyAngleX: 8 },
    SLEEPY: { ParamEyeOpen: 0.45, ParamMouthOpenY: 0.05, ParamBodyAngleX: -4 },
  },
  pmx: {
    IDLE: { morphs: [] },
    HAPPY: {
      morphs: [
        { name: "\u7b11\u3044", weight: 0.8 },
        { name: "\u3042", weight: 0.3 },
      ],
    },
    CONCERNED: { morphs: [{ name: "\u56f0\u308b", weight: 0.7 }] },
    FOCUSED: { morphs: [] },
    CURIOUS: { morphs: [{ name: "\u9a5a\u304d", weight: 0.5 }] },
    GAMING: {
      morphs: [
        { name: "\u7b11\u3044", weight: 0.6 },
        { name: "\u3042", weight: 0.5 },
      ],
    },
    SLEEPY: { morphs: [{ name: "\u56f0\u308b", weight: 0.35 }] },
  },
};

export function detectModelType(modelPath) {
  if (modelPath?.endsWith(".model3.json")) {
    return "live2d";
  }

  if (modelPath?.endsWith(".pmx")) {
    return "pmx";
  }

  return null;
}

function applyLive2dMood(model, mood) {
  const params = MOOD_PARAMS.live2d[mood] || MOOD_PARAMS.live2d.IDLE;
  const coreModel = model?.internalModel?.coreModel;
  if (!coreModel) {
    return;
  }

  Object.entries(params).forEach(([parameterId, value]) => {
    coreModel.setParameterValueById(parameterId, value);
  });
}

function applyPmxMood(mesh, mood) {
  const params = MOOD_PARAMS.pmx[mood] || MOOD_PARAMS.pmx.IDLE;
  const dictionary = mesh?.morphTargetDictionary;
  const influences = mesh?.morphTargetInfluences;
  if (!dictionary || !influences) {
    return;
  }

  influences.fill(0);
  params.morphs.forEach(({ name, weight }) => {
    const index = dictionary[name];
    if (typeof index === "number") {
      influences[index] = weight;
    }
  });
}

function fitLive2dModel(model, container, viewport = {}) {
  const bounds = model.getLocalBounds();
  const targetWidth = Math.max(container.clientWidth * 0.78, 1);
  const targetHeight = Math.max(container.clientHeight * 0.9, 1);
  const baseScale = Math.min(
    targetWidth / Math.max(bounds.width, 1),
    targetHeight / Math.max(bounds.height, 1)
  );
  const scale = baseScale * (viewport.scale ?? 1);
  const offsetX =
    (((viewport.positionX ?? 50) - 50) / 50) * container.clientWidth * 0.36;
  const offsetY =
    (((viewport.positionY ?? 50) - 50) / 50) * container.clientHeight * 0.44;

  model.scale.set(scale);
  model.x =
    container.clientWidth / 2 - (bounds.x + bounds.width / 2) * scale + offsetX;
  model.y = container.clientHeight - (bounds.y + bounds.height) * scale + offsetY;
}

let cubismCorePromise = null;

async function ensureLive2dCubismCore(resolveAssetUrl) {
  if (window.Live2DCubismCore) {
    return;
  }

  if (!cubismCorePromise) {
    cubismCorePromise = (async () => {
      const candidates = ["assets/live2d/live2dcubismcore.min.js"];

      for (const candidate of candidates) {
        const assetUrl = await resolveAssetUrl(candidate);
        if (!assetUrl) {
          continue;
        }

        try {
          await new Promise((resolve, reject) => {
            const existing = document.querySelector(
              `script[data-live2d-core="${candidate}"]`
            );
            if (existing) {
              existing.addEventListener("load", resolve, { once: true });
              existing.addEventListener("error", reject, { once: true });
              return;
            }

            const script = document.createElement("script");
            script.src = assetUrl;
            script.async = true;
            script.dataset.live2dCore = candidate;
            script.onload = () => resolve();
            script.onerror = () =>
              reject(new Error(`Failed to load Live2D core: ${candidate}`));
            document.head.appendChild(script);
          });
        } catch {
          continue;
        }

        if (window.Live2DCubismCore) {
          return;
        }
      }

      throw new Error(
        "Live2D Cubism Core not found. Put live2dcubismcore.min.js in assets/live2d/."
      );
    })();
  }

  return cubismCorePromise;
}

async function loadLive2dModel(container, modelUrl) {
  const PIXI = await import("pixi.js");
  window.PIXI = PIXI;
  await ensureLive2dCubismCore(
    async (relativePath) => window.hanaDesktop?.resolveAssetUrl?.(relativePath) || ""
  );
  const { Live2DModel } = await import("pixi-live2d-display/cubism4");
  Live2DModel.registerTicker(PIXI.Ticker);

  const app = new PIXI.Application({
    width: container.clientWidth,
    height: container.clientHeight,
    antialias: true,
    autoStart: true,
    backgroundAlpha: 0,
  });
  app.renderer.resize(container.clientWidth, container.clientHeight);
  container.appendChild(app.view);

  const model = await Live2DModel.from(modelUrl);
  app.stage.addChild(model);

  const instance = {
    type: "live2d",
    model,
    viewport: { positionX: 50, positionY: 50, scale: 1 },
    applyViewport(nextViewport = instance.viewport) {
      instance.viewport = { ...instance.viewport, ...nextViewport };
      fitLive2dModel(model, container, instance.viewport);
    },
    cleanup() {
      resizeObserver?.disconnect();
      app.destroy(true, true);
      delete window.PIXI;
    },
  };

  instance.applyViewport();

  const resize = () => {
    app.renderer.resize(container.clientWidth, container.clientHeight);
    instance.applyViewport();
  };

  const resizeObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);

  return instance;
}

function fitPmxModel(instance, camera, container, THREE, viewport = {}) {
  const metrics = instance.metrics;
  const mesh = instance.model;
  const size = metrics.size;
  const scale = viewport.scale ?? 1;
  const largest = Math.max(size.x, size.y, size.z, 1);
  const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  // PMX should default to face/upper-body framing, not full-body center.
  const focusX = metrics.center.x;
  const focusY = metrics.minY + size.y * 0.76;
  const focusZ = metrics.center.z;
  const framedWidth = Math.max(size.x * scale * 0.78, 1);
  const framedHeight = Math.max(size.y * scale * 0.58, 1);
  const fitDistance = Math.max(
    (framedWidth / 2) / Math.tan(hFov / 2),
    (framedHeight / 2) / Math.tan(vFov / 2)
  );
  const distance = fitDistance * 1.18;
  const offsetX = (((viewport.positionX ?? 50) - 50) / 50) * size.x * scale * 0.22;
  const offsetY = (((viewport.positionY ?? 50) - 50) / 50) * size.y * scale * 0.28;

  mesh.position.set(-focusX + offsetX, -focusY - offsetY, -focusZ);
  mesh.scale.setScalar(scale);
  mesh.rotation.set(0, 0, 0);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = Math.max(distance + largest * 6, 2000);
  camera.updateProjectionMatrix();
}

async function loadPmxModel(container, modelUrl) {
  const [THREE, { MMDLoader }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/MMDLoader.js"),
  ]);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    35,
    Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
    0.1,
    2000
  );
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(0, 1, 1);
  scene.add(keyLight);

  const loader = new MMDLoader();
  const mesh = await new Promise((resolve, reject) => {
    loader.load(modelUrl, resolve, undefined, reject);
  });

  scene.add(mesh);
  const baseBox = new THREE.Box3().setFromObject(mesh);
  const baseSize = baseBox.getSize(new THREE.Vector3());
  const baseCenter = baseBox.getCenter(new THREE.Vector3());

  let animationFrameId = 0;
  const render = () => {
    renderer.render(scene, camera);
    animationFrameId = window.requestAnimationFrame(render);
  };

  const instance = {
    type: "pmx",
    model: mesh,
    metrics: {
      center: baseCenter.clone(),
      minY: baseBox.min.y,
      size: baseSize.clone(),
    },
    viewport: { positionX: 50, positionY: 50, scale: 1 },
    applyViewport(nextViewport = instance.viewport) {
      instance.viewport = { ...instance.viewport, ...nextViewport };
      fitPmxModel(instance, camera, container, THREE, instance.viewport);
    },
    cleanup() {
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      scene.clear();
    },
  };

  instance.applyViewport();
  render();

  const resize = () => {
    camera.aspect =
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    instance.applyViewport();
    renderer.render(scene, camera);
  };

  const resizeObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);

  return instance;
}

export async function loadCharacterModel(container, modelPath, resolveAssetUrl) {
  const type = detectModelType(modelPath);
  const modelUrl = await resolveAssetUrl(modelPath);

  if (!type || !modelUrl) {
    return null;
  }

  if (type === "live2d") {
    return loadLive2dModel(container, modelUrl);
  }

  if (type === "pmx") {
    return loadPmxModel(container, modelUrl);
  }

  return null;
}

export function applyMood(instance, mood) {
  if (!instance) {
    return;
  }

  if (instance.type === "live2d") {
    applyLive2dMood(instance.model, mood);
  }

  if (instance.type === "pmx") {
    applyPmxMood(instance.model, mood);
  }
}

export function applyGaze(instance, x, y) {
  if (!instance) {
    return;
  }

  if (instance.type === "live2d") {
    const coreModel = instance.model?.internalModel?.coreModel;
    if (!coreModel) {
      return;
    }

    coreModel.setParameterValueById("ParamEyeBallX", x);
    coreModel.setParameterValueById("ParamEyeBallY", -y);
  }

  if (instance.type === "pmx") {
    instance.model.rotation.x = y * 0.3;
    instance.model.rotation.y = x * 0.3;
  }
}

export function applyViewportTransform(instance, viewport) {
  instance?.applyViewport?.(viewport);
}
