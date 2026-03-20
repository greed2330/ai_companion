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

const WINDOW_ROUTES = {
  bubble: "bubble",
  character: "character",
  chat: "chat",
  settings: "settings"
};

const BUBBLE_SIZE = { width: 220, height: 90 };
const SNAP = 40;

let characterWindow = null;
let bubbleWindow = null;
let chatWindow = null;
let settingsWindow = null;
let tray = null;
let ipcRegistered = false;
let shortcutsRegistered = false;
let uiState = {
  characterPinned: false,
  onboardingDone: false
};

function getUiStatePath() {
  const baseDir =
    typeof app.getPath === "function"
      ? app.getPath("userData")
      : path.join(process.cwd(), ".tmp");
  return path.join(baseDir, "hana-ui-state.json");
}

function loadUiState() {
  try {
    uiState = {
      ...uiState,
      ...JSON.parse(fs.readFileSync(getUiStatePath(), "utf8"))
    };
  } catch {
    uiState = { ...uiState };
  }
}

function saveUiState() {
  try {
    const statePath = getUiStatePath();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(uiState, null, 2));
  } catch {
    return;
  }
}

function getRendererEntry(route) {
  if (!app.isPackaged) {
    return `http://localhost:3000#/${route}`;
  }

  return path.join(__dirname, "../dist/index.html");
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

function showWindow(targetWindow) {
  if (!targetWindow) {
    return false;
  }

  targetWindow.show();
  if (targetWindow.focus) {
    targetWindow.focus();
  }
  return true;
}

function createAppWindow(route, options) {
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

  characterWindow = createAppWindow(WINDOW_ROUTES.character, {
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
  bubbleWindow = createAppWindow(WINDOW_ROUTES.bubble, {
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

function createChatWindow() {
  const display = screen.getPrimaryDisplay();
  const width = 480;
  const height = 600;

  chatWindow = createAppWindow(WINDOW_ROUTES.chat, {
    width,
    height,
    minWidth: 420,
    minHeight: 520,
    x: display.workArea.x + display.workArea.width - width - 44,
    y: display.workArea.y + display.workArea.height - height - 60,
    focusable: true,
    resizable: true,
    show: false,
    skipTaskbar: false
  });
}

function createSettingsWindow() {
  const display = screen.getPrimaryDisplay();
  const width = 420;
  const height = 520;

  settingsWindow = createAppWindow(WINDOW_ROUTES.settings, {
    width,
    height,
    minWidth: 380,
    minHeight: 460,
    x: display.workArea.x + display.workArea.width - width - 64,
    y: display.workArea.y + 64,
    focusable: true,
    resizable: true,
    show: false,
    skipTaskbar: false
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "../assets/tray.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("HANA");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Chat",
        click: () => showWindow(chatWindow)
      },
      {
        label: "Settings",
        click: () => showWindow(settingsWindow)
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => app.quit()
      }
    ])
  );
}

function registerShortcuts() {
  if (shortcutsRegistered) {
    return;
  }

  globalShortcut.register("Alt+H", () => {
    toggleWindowVisibility(chatWindow);
  });
  shortcutsRegistered = true;
}

function moveCharacterWindowBy(deltaX, deltaY) {
  if (!characterWindow || uiState.characterPinned) {
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
  ipcMain.handle("window:show-chat", () => showWindow(chatWindow));
  ipcMain.handle("window:show-settings", () => showWindow(settingsWindow));
  ipcMain.handle("app:quit", () => app.quit());
  ipcMain.handle("character:get-bounds", () => characterWindow?.getBounds() || null);
  ipcMain.handle("character:get-state", () => ({
    pinned: uiState.characterPinned
  }));
  ipcMain.handle("character:move-by", (_event, deltaX, deltaY) =>
    moveCharacterWindowBy(deltaX, deltaY)
  );
  ipcMain.handle("character:finish-drag", () => finishCharacterDrag());
  ipcMain.handle("character:toggle-pin", () => {
    uiState.characterPinned = !uiState.characterPinned;
    saveUiState();
    return { pinned: uiState.characterPinned };
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
  if (uiState.onboardingDone) {
    return;
  }

  setTimeout(() => {
    showBubble({
      message: "안녕! 나 하나야~ 우클릭해봐!",
      mood: "HAPPY",
      type: "talk"
    });
  }, 500);
  uiState.onboardingDone = true;
  saveUiState();
}

function createWindows() {
  loadUiState();
  createCharacterWindow();
  createBubbleWindow();
  createChatWindow();
  createSettingsWindow();
  createTray();
  registerShortcuts();
  registerIpcHandlers();
  maybeShowOnboardingBubble();
}

if (process.env.NODE_ENV !== "test") {
  app.whenReady().then(() => {
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
  resolveAssetUrl,
  showBubble,
  snapToEdge,
  toggleWindowVisibility
};
