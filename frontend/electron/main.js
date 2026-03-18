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
  character: "character",
  chat: "chat",
  settings: "settings"
};

let characterWindow = null;
let chatWindow = null;
let settingsWindow = null;
let tray = null;
let ipcRegistered = false;
let shortcutsRegistered = false;

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

function createAppWindow(route, options) {
  const windowInstance = new BrowserWindow({
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
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
    resizable: false,
    hasShadow: false
  });
  characterWindow.setIgnoreMouseEvents(true, { forward: true });
}

function createChatWindow() {
  const display = screen.getPrimaryDisplay();
  const width = 480;
  const height = 600;

  chatWindow = createAppWindow(WINDOW_ROUTES.chat, {
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - 44,
    y: display.workArea.y + display.workArea.height - height - 60,
    focusable: true,
    show: false,
    resizable: false
  });
}

function createSettingsWindow() {
  const display = screen.getPrimaryDisplay();
  const width = 420;
  const height = 520;

  settingsWindow = createAppWindow(WINDOW_ROUTES.settings, {
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - 64,
    y: display.workArea.y + 64,
    focusable: true,
    show: false,
    resizable: false
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
        click: () => toggleWindowVisibility(chatWindow)
      },
      {
        label: "Settings",
        click: () => toggleWindowVisibility(settingsWindow)
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

function registerIpcHandlers() {
  if (ipcRegistered) {
    return;
  }

  ipcMain.handle("assets:resolve-url", (_event, relativePath) =>
    resolveAssetUrl(relativePath)
  );
  ipcRegistered = true;
}

function createWindows() {
  createCharacterWindow();
  createChatWindow();
  createSettingsWindow();
  createTray();
  registerShortcuts();
  registerIpcHandlers();
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
  createWindows,
  resolveAssetUrl,
  toggleWindowVisibility
};
