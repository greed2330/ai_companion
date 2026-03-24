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
  character: "character",
  main: "main"
};

const BUBBLE_SIZE = { width: 220, height: 90 };
const MAIN_WINDOW_SIZE = { width: 480, height: 680 };
const SNAP = 40;

let bubbleWindow = null;
let characterWindow = null;
let mainWindow = null;
let tray = null;
let ipcRegistered = false;
let shortcutsRegistered = false;

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
  if (!targetWindow) {
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
  if (!mainWindow) {
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

  mainWindow = new BrowserWindow({
    width: MAIN_WINDOW_SIZE.width,
    height: MAIN_WINDOW_SIZE.height,
    frame: false,
    resizable: false,
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
  const width = 300;
  const height = 400;

  characterWindow = createOverlayWindow(WINDOW_ROUTES.character, {
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - 24,
    y: display.workArea.y + display.workArea.height - height - 24,
    focusable: false,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true
  });

  characterWindow.setIgnoreMouseEvents(true, { forward: true });
  characterWindow.on("move", () => {
    syncBubblePosition();
  });
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
    BrowserWindow.fromWebContents(event.sender)?.hide();
  });
  ipcMain.handle("app:quit", () => app.quit());
  ipcMain.handle("character:get-bounds", () => characterWindow?.getBounds() || null);
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
