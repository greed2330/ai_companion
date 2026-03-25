const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray
} = require("electron");

let store = null;
const DEFAULT_SHORTCUT = "Alt+H";
const DEFAULT_APP_SETTINGS = {
  app: {
    theme: "dark-anime",
    shortcut: DEFAULT_SHORTCUT,
    autoLaunch: false
  },
  character: {
    viewportScale: 100,
    positionX: 50,
    positionY: 50,
    opacity: 100
  },
  integrations: {
    serper: { status: "grey", apiKey: "" },
    google_calendar: { status: "grey", apiKey: "", note: "credentials.json 필요" },
    github: { status: "grey", apiKey: "" }
  },
  voice: {
    inputMode: "text",
    outputMode: "chat",
    ttsEnabled: false,
    voicePreset: "kokoro",
    samplePath: "",
    hotwordEnabled: false
  }
};

const WINDOW_ROUTES = {
  bubble: "bubble",
  charPosition: "charPosition",
  character: "character",
  main: "main"
};

const BUBBLE_SIZE = { width: 220, height: 90 };
const MAIN_WINDOW_SIZE = { width: 420, height: 640 };
const SNAP = 40;

let bubbleWindow = null;
let charPositionWindow = null;
let characterWindow = null;
let mainWindow = null;
let tray = null;
let ipcRegistered = false;
let shortcutsRegistered = false;

function isWindowUsable(targetWindow) {
  return Boolean(targetWindow) && !targetWindow.isDestroyed?.();
}

if (process.env.NODE_ENV === "test") {
  const Store = require("electron-store");
  store = new Store();
}

async function initializeStore() {
  if (store) {
    return store;
  }

  const { default: Store } = await import("electron-store");
  store = new Store();
  return store;
}

function getRendererEntry(route) {
  if (!app.isPackaged) {
    return `http://localhost:3000#/${route}`;
  }

  return path.join(__dirname, "../dist/index.html");
}

function getStoredAppSettings() {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...(store.get("appSettings") || {})
  };
}

function saveStoredAppSettings(nextSettings) {
  const merged = {
    ...DEFAULT_APP_SETTINGS,
    ...nextSettings
  };
  store.set("appSettings", merged);
  return merged;
}

function updateTrayTooltip(name = "HANA") {
  tray?.setToolTip?.(name || "HANA");
}

function resolveAssetUrl(relativePath) {
  if (!relativePath) {
    return "";
  }

  const normalizedPath = relativePath.replace(/\\/g, "/");
  if (!app.isPackaged) {
    const devPath = normalizedPath.startsWith("assets/")
      ? normalizedPath.slice("assets/".length)
      : normalizedPath;
    return `http://localhost:3000/__hana_assets__/${devPath}`;
  }

  return pathToFileURL(path.join(app.getAppPath(), normalizedPath)).toString();
}

function toggleWindowVisibility(targetWindow) {
  if (!isWindowUsable(targetWindow)) {
    return false;
  }

  if (targetWindow.isVisible()) {
    targetWindow.hide();
    return false;
  }

  targetWindow.show();
  targetWindow.focus();
  return true;
}

function showMainWindow(tab = "chat") {
  if (!isWindowUsable(mainWindow)) {
    createMainWindow();
  }

  if (!isWindowUsable(mainWindow)) {
    return false;
  }

  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("set-tab", tab);
  return true;
}

function createOverlayWindow(route, options) {
  const windowInstance = new BrowserWindow({
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    },
    ...options
  });

  if (!app.isPackaged) {
    windowInstance.loadURL(getRendererEntry(route));
  } else {
    windowInstance.loadFile(getRendererEntry(route), { hash: `/${route}` });
  }

  return windowInstance;
}

function createMainWindow() {
  const display = screen.getPrimaryDisplay();
  const savedSize = store.get("mainWindowSize");

  mainWindow = new BrowserWindow({
    width: savedSize?.width ?? MAIN_WINDOW_SIZE.width,
    height: savedSize?.height ?? MAIN_WINDOW_SIZE.height,
    minWidth: 360,
    minHeight: 560,
    maxWidth: 600,
    frame: false,
    resizable: true,
    skipTaskbar: false,
    focusable: true,
    show: false,
    backgroundColor: "#0d1117",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  const defaultX = display.workArea.x + display.workArea.width - MAIN_WINDOW_SIZE.width - 44;
  const defaultY = display.workArea.y + display.workArea.height - MAIN_WINDOW_SIZE.height - 60;
  const position = store.get("mainWindowPos");

  mainWindow.setPosition(position?.x ?? defaultX, position?.y ?? defaultY);
  mainWindow.on("move", () => {
    const [x, y] = mainWindow.getPosition();
    store.set("mainWindowPos", { x, y });
  });
  mainWindow.on("resize", () => {
    const [width, height] = mainWindow.getSize();
    store.set("mainWindowSize", { width, height });
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (!app.isPackaged) {
    mainWindow.loadURL(getRendererEntry(WINDOW_ROUTES.main));
  } else {
    mainWindow.loadFile(getRendererEntry(WINDOW_ROUTES.main), {
      hash: `/${WINDOW_ROUTES.main}`
    });
  }
}

function snapToEdge(x, y, winW, winH, sw, sh) {
  return {
    x: x < SNAP ? 0 : x + winW > sw - SNAP ? sw - winW : x,
    y: y < SNAP ? 0 : y + winH > sh - SNAP ? sh - winH : y
  };
}

function calcBubblePosition(charBounds, bubbleSize, screenSize) {
  const { x, y, width, height } = charBounds;
  const { width: bw, height: bh } = bubbleSize;
  const { width: sw, height: sh } = screenSize;
  const position =
    y >= bh + 20
      ? { x: x + width / 2 - bw / 2, y: y - bh - 16, tail: "bottom" }
      : sh - (y + height) >= bh + 20
        ? { x: x + width / 2 - bw / 2, y: y + height + 16, tail: "top" }
        : x >= bw + 20
          ? { x: x - bw - 16, y: y + height / 2 - bh / 2, tail: "right" }
          : { x: x + width + 16, y: y + height / 2 - bh / 2, tail: "left" };

  position.x = Math.max(0, Math.min(sw - bw, position.x));
  position.y = Math.max(0, Math.min(sh - bh, position.y));
  return position;
}

function getCharacterDisplay() {
  if (!characterWindow) {
    return screen.getPrimaryDisplay();
  }

  return screen.getDisplayMatching(characterWindow.getBounds());
}

function syncBubblePosition(force = false) {
  if ((!bubbleWindow?.isVisible() && !force) || !characterWindow) {
    return null;
  }

  const display = getCharacterDisplay();
  const position = calcBubblePosition(
    characterWindow.getBounds(),
    BUBBLE_SIZE,
    display.workAreaSize
  );

  bubbleWindow.setBounds({
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: BUBBLE_SIZE.width,
    height: BUBBLE_SIZE.height
  });
  bubbleWindow.webContents.send("bubble-tail", position.tail);
  return position;
}

function showBubble(payload) {
  if (!bubbleWindow || !characterWindow) {
    return null;
  }

  const position = syncBubblePosition(true);
  bubbleWindow.webContents.send("bubble-data", {
    captureImage: payload.captureImage || "",
    duration: payload.duration || 0,
    message: payload.message || "",
    mood: payload.mood || "IDLE",
    tail: position?.tail || "bottom",
    type: payload.type || "talk"
  });

  if (typeof bubbleWindow.showInactive === "function") {
    bubbleWindow.showInactive();
  } else {
    bubbleWindow.show();
  }

  return position;
}

function createCharacterWindow() {
  const display = screen.getPrimaryDisplay();
  const savedPosition = store.get("charPosition") || { x: 88, y: 50, size: "M" };
  const sizeMap = {
    S: { w: 200, h: 350 },
    M: { w: 300, h: 500 },
    L: { w: 400, h: 650 },
    XL: { w: 500, h: 800 }
  };
  const selectedSize = sizeMap[savedPosition.size] || sizeMap.M;
  const width = selectedSize.w;
  const height = selectedSize.h;
  const x = Math.round((savedPosition.x / 100) * (display.workArea.width - width));
  const y = Math.round((savedPosition.y / 100) * (display.workArea.height - height));

  characterWindow = createOverlayWindow(WINDOW_ROUTES.character, {
    width,
    height,
    x: display.workArea.x + x,
    y: display.workArea.y + y,
    focusable: false,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true
  });

  characterWindow.setOpacity?.((getStoredAppSettings().character.opacity || 100) / 100);
  characterWindow.setIgnoreMouseEvents(true, { forward: true });
  characterWindow.on("move", () => {
    syncBubblePosition();
  });
  characterWindow.on("closed", () => {
    characterWindow = null;
  });
}

function persistCharacterWindowPlacement(bounds) {
  if (!bounds) {
    return;
  }

  const display = getCharacterDisplay();
  const widthRange = Math.max(display.workArea.width - bounds.width, 0);
  const heightRange = Math.max(display.workArea.height - bounds.height, 0);
  const normalizedX = widthRange === 0 ? 0 : ((bounds.x - display.workArea.x) / widthRange) * 100;
  const normalizedY = heightRange === 0 ? 0 : ((bounds.y - display.workArea.y) / heightRange) * 100;
  const previousCharPosition = store.get("charPosition") || { x: 88, y: 50, size: "M" };

  store.set("charPosition", {
    ...previousCharPosition,
    x: Math.max(0, Math.min(100, Math.round(normalizedX))),
    y: Math.max(0, Math.min(100, Math.round(normalizedY)))
  });
}

function createCharPositionWindow() {
  if (charPositionWindow) {
    charPositionWindow.show();
    charPositionWindow.focus();
    return charPositionWindow;
  }

  charPositionWindow = new BrowserWindow({
    width: 260,
    height: 420,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: "#0f0f14",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  if (!app.isPackaged) {
    charPositionWindow.loadURL(getRendererEntry(WINDOW_ROUTES.charPosition));
  } else {
    charPositionWindow.loadFile(getRendererEntry(WINDOW_ROUTES.main), {
      hash: `/${WINDOW_ROUTES.charPosition}`
    });
  }
  charPositionWindow.on("closed", () => {
    charPositionWindow = null;
  });
  return charPositionWindow;
}

function createBubbleWindow() {
  bubbleWindow = createOverlayWindow(WINDOW_ROUTES.bubble, {
    width: BUBBLE_SIZE.width,
    height: BUBBLE_SIZE.height,
    focusable: false,
    hasShadow: false,
    resizable: false,
    show: false,
    skipTaskbar: true
  });

  bubbleWindow.setIgnoreMouseEvents(true, { forward: true });
  bubbleWindow.on("closed", () => {
    bubbleWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "../assets/tray.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  updateTrayTooltip("HANA");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "채팅 열기", click: () => showMainWindow("chat") },
      { label: "설정 열기", click: () => showMainWindow("settings") },
      { type: "separator" },
      { label: "종료", click: () => app.quit() }
    ])
  );
}

function registerShortcuts() {
  const shortcut = getStoredAppSettings().app.shortcut || DEFAULT_SHORTCUT;

  if (shortcutsRegistered) {
    globalShortcut.unregisterAll();
  }

  globalShortcut.register(shortcut, () => {
    toggleWindowVisibility(mainWindow);
  });
  shortcutsRegistered = true;
}

function moveCharacterWindowBy(deltaX, deltaY) {
  if (!characterWindow || store.get("characterPinned", false)) {
    return characterWindow?.getBounds() || null;
  }

  const bounds = characterWindow.getBounds();
  const display = getCharacterDisplay();
  const next = snapToEdge(
    bounds.x + deltaX,
    bounds.y + deltaY,
    bounds.width,
    bounds.height,
    display.workAreaSize.width,
    display.workAreaSize.height
  );

  characterWindow.setPosition(Math.round(next.x), Math.round(next.y));
  persistCharacterWindowPlacement({
    ...bounds,
    x: Math.round(next.x),
    y: Math.round(next.y)
  });
  return { ...bounds, ...next };
}

function finishCharacterDrag() {
  if (!characterWindow) {
    return null;
  }

  const bounds = characterWindow.getBounds();
  const display = getCharacterDisplay();
  const next = snapToEdge(
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    display.workAreaSize.width,
    display.workAreaSize.height
  );

  characterWindow.setPosition(Math.round(next.x), Math.round(next.y));
  persistCharacterWindowPlacement({
    ...bounds,
    x: Math.round(next.x),
    y: Math.round(next.y)
  });
  return { ...bounds, ...next };
}

function registerIpcHandlers() {
  if (ipcRegistered) {
    return;
  }

  ipcMain.handle("app-settings:get", () => getStoredAppSettings());
  ipcMain.handle("app-settings:save", (_event, payload) => {
    const saved = saveStoredAppSettings(payload);

    registerShortcuts();
    if (typeof app.setLoginItemSettings === "function") {
      app.setLoginItemSettings({
        openAtLogin: Boolean(saved.app?.autoLaunch)
      });
    }

    return saved;
  });
  ipcMain.on("window-minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on("window-hide", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
  });
  ipcMain.on("settings-saved", (_event, payload) => {
    const current = getStoredAppSettings();
    saveStoredAppSettings({
      ...current,
      app: {
        ...current.app,
        theme: payload?.theme ?? current.app.theme,
        autoLaunch: payload?.autoLaunch ?? current.app.autoLaunch
      }
    });
  });
  ipcMain.on("set-auto-launch", (_event, value) => {
    if (typeof app.setLoginItemSettings === "function") {
      app.setLoginItemSettings({ openAtLogin: Boolean(value) });
    }
  });
  ipcMain.on("char-viewport-size", (_event, value) => {
    if (!characterWindow) {
      return;
    }
    const baseWidth = 300;
    const baseHeight = 500;
    const scale = Math.max(0.5, Math.min(2, Number(value || 100) / 100));
    characterWindow.setSize(Math.round(baseWidth * scale), Math.round(baseHeight * scale));
  });
  ipcMain.on("char-viewport-opacity", (_event, value) => {
    characterWindow?.setOpacity?.(Math.max(0.2, Math.min(1, Number(value || 100) / 100)));
  });
  ipcMain.on("open-char-position-popup", () => {
    createCharPositionWindow();
  });
  ipcMain.handle("char-position-apply", (_event, payload) => {
    if (!characterWindow) {
      return null;
    }
    const current = getStoredAppSettings();
    const sizeMap = {
      S: { w: 200, h: 350 },
      M: { w: 300, h: 500 },
      L: { w: 400, h: 650 },
      XL: { w: 500, h: 800 }
    };
    const selectedSize = sizeMap[payload?.size] || sizeMap.M;
    const previousCharPosition = store.get("charPosition") || { x: 88, y: 50, size: "M" };
    const saved = saveStoredAppSettings({
      ...current,
      character: {
        ...current.character,
        positionX: Number(payload?.x ?? current.character.positionX ?? 50),
        positionY: Number(payload?.y ?? current.character.positionY ?? 50)
      }
    });
    const display = getCharacterDisplay();
    const currentBounds = characterWindow.getBounds();
    const clampedX = Math.max(
      display.workArea.x,
      Math.min(display.workArea.x + display.workArea.width - selectedSize.w, currentBounds.x)
    );
    const clampedY = Math.max(
      display.workArea.y,
      Math.min(display.workArea.y + display.workArea.height - selectedSize.h, currentBounds.y)
    );
    const sizeChanged =
      currentBounds.width !== selectedSize.w || currentBounds.height !== selectedSize.h;

    if (sizeChanged) {
      characterWindow.setSize(selectedSize.w, selectedSize.h);
      characterWindow.setPosition(clampedX, clampedY);
      persistCharacterWindowPlacement({
        ...currentBounds,
        width: selectedSize.w,
        height: selectedSize.h,
        x: clampedX,
        y: clampedY
      });
    }

    store.set("charPosition", {
      ...(store.get("charPosition") || previousCharPosition),
      size: payload?.size || previousCharPosition.size
    });
    characterWindow.webContents.send("character-settings-updated", saved.character);
    syncBubblePosition(true);
    return saved.character;
  });
  ipcMain.handle("assets:resolve-url", (_event, relativePath) =>
    resolveAssetUrl(relativePath)
  );
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("window:maximize-toggle", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return false;
    }

    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
      return false;
    }

    targetWindow.maximize();
    return true;
  });
  ipcMain.handle("window:close", (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return;
    }

    if (targetWindow === mainWindow) {
      targetWindow.hide();
      return;
    }

    targetWindow.close();
  });
  ipcMain.handle("app:quit", () => app.quit());
  ipcMain.handle("character:get-bounds", () => characterWindow?.getBounds() || null);
  ipcMain.handle("character:get-window-placement", () =>
    store.get("charPosition") || { x: 88, y: 50, size: "M" }
  );
  ipcMain.handle("character:get-state", () => ({
    pinned: store.get("characterPinned", false)
  }));
  ipcMain.handle("character:move-by", (_event, deltaX, deltaY) =>
    moveCharacterWindowBy(deltaX, deltaY)
  );
  ipcMain.handle("character:finish-drag", () => finishCharacterDrag());
  ipcMain.handle("character:toggle-pin", () => {
    const nextPinned = !store.get("characterPinned", false);
    store.set("characterPinned", nextPinned);
    return { pinned: nextPinned };
  });
  ipcMain.on("ai-name-changed", (_event, name) => {
    updateTrayTooltip(name);
    bubbleWindow?.webContents?.send("ai-name-changed", name);
  });
  ipcMain.on("open-main-chat", () => {
    showMainWindow("chat");
  });
  ipcMain.on("open-main-settings", () => {
    showMainWindow("settings");
  });
  ipcMain.on("char-mouse-enter", () => {
    characterWindow?.setIgnoreMouseEvents(false);
  });
  ipcMain.on("char-mouse-leave", () => {
    characterWindow?.setIgnoreMouseEvents(true, { forward: true });
  });
  ipcMain.on("show-bubble", (_event, payload) => {
    showBubble(payload);
  });
  ipcMain.on("hide-bubble", () => {
    bubbleWindow?.hide();
  });

  ipcRegistered = true;
}

function maybeShowOnboardingBubble() {
  if (store.get("onboardingDone")) {
    return;
  }

  setTimeout(() => {
    showBubble({
      message: "안녕! 나는 하나야. 클릭해서 놀아줘",
      mood: "HAPPY",
      type: "talk"
    });
  }, 500);

  setTimeout(() => {
    showMainWindow("settings");
  }, 3000);

  store.set("onboardingDone", true);
}

function createWindows() {
  createCharacterWindow();
  createBubbleWindow();
  createMainWindow();
  createTray();
  registerShortcuts();
  registerIpcHandlers();
  maybeShowOnboardingBubble();
}

if (process.env.NODE_ENV !== "test") {
  app.whenReady().then(async () => {
    await initializeStore();
    createWindows();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindows();
      }
    });
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

module.exports = {
  WINDOW_ROUTES,
  calcBubblePosition,
  createWindows,
  getStoredAppSettings,
  resolveAssetUrl,
  showBubble,
  showMainWindow,
  snapToEdge,
  toggleWindowVisibility
};
