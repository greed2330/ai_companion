const storeState = {};

jest.mock("electron-store", () =>
  jest.fn().mockImplementation(() => ({
    get: jest.fn((key) => storeState[key]),
    set: jest.fn((key, value) => {
      storeState[key] = value;
    })
  }))
);

jest.mock("electron", () => {
  const handlers = {};
  const listeners = {};
  const browserWindows = [];

  class BrowserWindowMock {
    static fromWebContents = jest.fn(() => browserWindows[0]);
    static getAllWindows = jest.fn(() => browserWindows);

    constructor(options) {
      this.options = options;
      this.bounds = {
        width: options.width,
        height: options.height,
        x: options.x || 0,
        y: options.y || 0
      };
      this.visible = Boolean(options.show);
      this.webContents = {
        send: jest.fn()
      };
      this.listeners = {};
      browserWindows.push(this);
    }

    loadURL = jest.fn();
    loadFile = jest.fn();
    setIgnoreMouseEvents = jest.fn();
    setBounds = jest.fn((bounds) => {
      this.bounds = { ...this.bounds, ...bounds };
    });
    setPosition = jest.fn((x, y) => {
      this.bounds = { ...this.bounds, x, y };
    });
    setSize = jest.fn((width, height) => {
      this.bounds = { ...this.bounds, width, height };
    });
    setOpacity = jest.fn();
    getPosition = jest.fn(() => [this.bounds.x, this.bounds.y]);
    getBounds = jest.fn(() => this.bounds);
    getSize = jest.fn(() => [this.bounds.width, this.bounds.height]);
    isVisible = jest.fn(() => this.visible);
    show = jest.fn(() => {
      this.visible = true;
    });
    showInactive = jest.fn(() => {
      this.visible = true;
    });
    hide = jest.fn(() => {
      this.visible = false;
    });
    focus = jest.fn();
    minimize = jest.fn();
    maximize = jest.fn();
    unmaximize = jest.fn();
    isMaximized = jest.fn(() => false);
    on = jest.fn((event, handler) => {
      this.listeners[event] = handler;
    });
  }

  return {
    __handlers: handlers,
    __listeners: listeners,
    __windows: browserWindows,
    app: {
      isPackaged: false,
      on: jest.fn(),
      quit: jest.fn(),
      setLoginItemSettings: jest.fn(),
      whenReady: jest.fn(() => Promise.resolve()),
      getAppPath: jest.fn(() => "E:/Projects/hana_project/hana_codex")
    },
    BrowserWindow: BrowserWindowMock,
    globalShortcut: {
      register: jest.fn(),
      unregisterAll: jest.fn()
    },
    ipcMain: {
      handle: jest.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
      on: jest.fn((channel, handler) => {
        listeners[channel] = handler;
      })
    },
    Menu: {
      buildFromTemplate: jest.fn((template) => template)
    },
    nativeImage: {
      createEmpty: jest.fn(() => ({})),
      createFromPath: jest.fn(() => ({}))
    },
    screen: {
      getPrimaryDisplay: jest.fn(() => ({
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        workAreaSize: { width: 1920, height: 1080 }
      })),
      getDisplayMatching: jest.fn(() => ({
        workAreaSize: { width: 1920, height: 1080 }
      }))
    },
    Tray: jest.fn(() => ({
      setToolTip: jest.fn(),
      setContextMenu: jest.fn()
    }))
  };
});

describe("electron main windows", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    Object.keys(storeState).forEach((key) => delete storeState[key]);
    jest.resetModules();
    const electron = require("electron");
    electron.__windows.length = 0;
    Object.keys(electron.__listeners).forEach((key) => delete electron.__listeners[key]);
    Object.keys(electron.__handlers).forEach((key) => delete electron.__handlers[key]);
    electron.globalShortcut.register.mockClear();
  });

  test("bubbleWindow show/hide leaves character bounds unchanged", () => {
    const electron = require("electron");
    const main = require("../../electron/main");

    main.createWindows();
    const characterWindow = electron.__windows[0];
    const bubbleWindow = electron.__windows[1];
    const initialBounds = characterWindow.getBounds();

    electron.__listeners["show-bubble"](null, {
      message: "hello",
      mood: "IDLE",
      type: "talk"
    });
    electron.__listeners["hide-bubble"]();

    expect(characterWindow.getBounds()).toEqual(initialBounds);
    expect(bubbleWindow.showInactive).toHaveBeenCalled();
    expect(bubbleWindow.hide).toHaveBeenCalled();
  });

  test("IPC open-main-settings activates settings tab", () => {
    const electron = require("electron");
    const main = require("../../electron/main");

    main.createWindows();
    const unifiedWindow = electron.__windows[2];

    electron.__listeners["open-main-settings"]();

    expect(unifiedWindow.show).toHaveBeenCalled();
    expect(unifiedWindow.webContents.send).toHaveBeenCalledWith("set-tab", "settings");
  });

  test("main window move is persisted and reused on next start", () => {
    let electron = require("electron");
    let main = require("../../electron/main");

    main.createWindows();
    const firstMainWindow = electron.__windows[2];
    firstMainWindow.setPosition(222, 333);
    firstMainWindow.listeners.move();

    jest.resetModules();
    electron = require("electron");
    electron.__windows.length = 0;
    main = require("../../electron/main");
    main.createWindows();

    const secondMainWindow = electron.__windows[2];
    expect(secondMainWindow.setPosition).toHaveBeenCalledWith(222, 333);
  });

  test("Alt+H toggles main window visibility", () => {
    const electron = require("electron");
    const main = require("../../electron/main");

    main.createWindows();
    const shortcutHandler = electron.globalShortcut.register.mock.calls[0][1];
    const unifiedWindow = electron.__windows[2];

    shortcutHandler();
    expect(unifiedWindow.show).toHaveBeenCalled();

    unifiedWindow.isVisible.mockReturnValue(true);
    shortcutHandler();
    expect(unifiedWindow.hide).toHaveBeenCalled();
  });

  test("saved shortcut is applied after restart", () => {
    storeState.appSettings = {
      app: { shortcut: "Ctrl+Shift+H", theme: "dark-anime", autoLaunch: false }
    };
    const electron = require("electron");
    const main = require("../../electron/main");

    main.createWindows();
    expect(electron.globalShortcut.register).toHaveBeenCalledWith(
      "Ctrl+Shift+H",
      expect.any(Function)
    );
  });

  test("bubble position above character uses bottom tail", () => {
    const { calcBubblePosition } = require("../../electron/main");
    expect(
      calcBubblePosition(
        { x: 300, y: 700, width: 300, height: 400 },
        { width: 220, height: 90 },
        { width: 1920, height: 1080 }
      ).tail
    ).toBe("bottom");
  });
});
