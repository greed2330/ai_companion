jest.mock("electron", () => ({
  app: {
    isPackaged: false,
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
    getAppPath: jest.fn(() => "E:/Projects/hana_project/hana_codex")
  },
  BrowserWindow: jest.fn(),
  globalShortcut: {
    register: jest.fn(),
    unregisterAll: jest.fn()
  },
  ipcMain: {
    handle: jest.fn()
  },
  Menu: {
    buildFromTemplate: jest.fn()
  },
  nativeImage: {
    createEmpty: jest.fn(() => ({})),
    createFromPath: jest.fn(() => ({}))
  },
  screen: {
    getPrimaryDisplay: jest.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    }))
  },
  Tray: jest.fn(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn()
  }))
}));

describe("Hotkey", () => {
  test("Alt+H toggles chat window visibility", () => {
    process.env.NODE_ENV = "test";
    const { toggleWindowVisibility } = require("../../electron/main");

    const windowMock = {
      isVisible: jest.fn(() => true),
      hide: jest.fn(),
      show: jest.fn(),
      focus: jest.fn()
    };

    expect(toggleWindowVisibility(windowMock)).toBe(false);
    expect(windowMock.hide).toHaveBeenCalled();

    windowMock.isVisible.mockReturnValue(false);
    expect(toggleWindowVisibility(windowMock)).toBe(true);
    expect(windowMock.show).toHaveBeenCalled();
  });
});
