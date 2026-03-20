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
    getBounds = jest.fn(() => this.bounds);
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
    app: {
      getPath: jest.fn(() => "E:/Projects/hana_project/hana_codex/.tmp"),
      isPackaged: false,
      on: jest.fn(),
      quit: jest.fn(),
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

describe("electron main bubble window", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    jest.resetModules();
  });

  test("bubbleWindow show/hide leaves character bounds unchanged", () => {
    const electron = require("electron");
    const main = require("../../electron/main");

    main.createWindows();
    const characterWindow = electron.BrowserWindow.getAllWindows()[0];
    const bubbleWindow = electron.BrowserWindow.getAllWindows()[1];
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

  test("bubble position below character uses top tail", () => {
    const { calcBubblePosition } = require("../../electron/main");
    expect(
      calcBubblePosition(
        { x: 300, y: 20, width: 300, height: 400 },
        { width: 220, height: 90 },
        { width: 1920, height: 1080 }
      ).tail
    ).toBe("top");
  });

  test("bubble position left of character uses right tail", () => {
    const { calcBubblePosition } = require("../../electron/main");
    expect(
      calcBubblePosition(
        { x: 1600, y: 50, width: 300, height: 980 },
        { width: 220, height: 90 },
        { width: 1920, height: 1080 }
      ).tail
    ).toBe("right");
  });
});
