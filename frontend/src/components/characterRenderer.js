const MOOD_PARAMS = {
  live2d: {
    IDLE: { ParamEyeOpen: 1.0, ParamMouthOpenY: 0, ParamBodyAngleX: 0 },
    HAPPY: { ParamEyeOpen: 0.6, ParamMouthOpenY: 0.8, ParamBodyAngleX: 5 },
    CONCERNED: { ParamEyeOpen: 1.0, ParamMouthOpenY: 0.2, ParamBodyAngleX: -3 },
    FOCUSED: { ParamEyeOpen: 1.0, ParamMouthOpenY: 0, ParamBodyAngleX: 0 },
    CURIOUS: { ParamEyeOpen: 1.2, ParamMouthOpenY: 0.1, ParamBodyAngleX: 10 },
    GAMING: { ParamEyeOpen: 1.2, ParamMouthOpenY: 0.5, ParamBodyAngleX: 8 }
  },
  pmx: {
    IDLE: { morphs: [] },
    HAPPY: { morphs: [{ name: "笑い", weight: 0.8 }, { name: "あ", weight: 0.3 }] },
    CONCERNED: { morphs: [{ name: "困る", weight: 0.7 }] },
    FOCUSED: { morphs: [] },
    CURIOUS: { morphs: [{ name: "驚き", weight: 0.5 }] },
    GAMING: { morphs: [{ name: "笑い", weight: 0.6 }, { name: "あ", weight: 0.5 }] }
  }
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

async function loadLive2dModel(container, modelUrl) {
  const [{ Application }, { Live2DModel }] = await Promise.all([
    import("pixi.js"),
    import("pixi-live2d-display")
  ]);

  const app = new Application({
    resizeTo: container,
    antialias: true,
    backgroundAlpha: 0
  });
  container.appendChild(app.view);

  const model = await Live2DModel.from(modelUrl);
  app.stage.addChild(model);
  model.anchor.set(0.5, 1);
  model.x = container.clientWidth / 2;
  model.y = container.clientHeight;
  const scale = Math.min(
    (container.clientWidth * 0.82) / model.width,
    (container.clientHeight * 0.92) / model.height
  );
  model.scale.set(scale);

  return {
    type: "live2d",
    model,
    cleanup() {
      app.destroy(true, true);
    }
  };
}

async function loadPmxModel(container, modelUrl) {
  const [THREE, { MMDLoader }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/MMDLoader.js")
  ]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    30,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff, 1.6);
  light.position.set(0, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));

  const loader = new MMDLoader();
  const mesh = await new Promise((resolve, reject) => {
    loader.load(modelUrl, resolve, undefined, reject);
  });

  mesh.position.y = -10;
  mesh.rotation.y = Math.PI;
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const scale = 18 / Math.max(size.x, size.y, size.z, 1);
  mesh.scale.setScalar(scale);
  scene.add(mesh);
  camera.position.set(0, 10, 40);
  renderer.render(scene, camera);

  return {
    type: "pmx",
    model: mesh,
    cleanup() {
      renderer.dispose();
      scene.clear();
    }
  };
}

export async function loadCharacterModel(container, modelPath, resolveAssetUrl) {
  const type = detectModelType(modelPath);
  const modelUrl = await resolveAssetUrl(modelPath);

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
