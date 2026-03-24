import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
}

class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
  }

  postMessage(message) {
    this.lastMessage = message;
  }

  close() {}
}

if (!global.BroadcastChannel) {
  global.BroadcastChannel = MockBroadcastChannel;
}

window.__VITE_API_BASE_URL__ = "http://test";
window.hanaDesktop = {
  closeWindow: jest.fn(),
  finishCharacterDrag: jest.fn(() => Promise.resolve()),
  getCharacterBounds: jest.fn(() =>
    Promise.resolve({ x: 100, y: 100, width: 300, height: 400 })
  ),
  getCharacterState: jest.fn(() => Promise.resolve({ pinned: false })),
  hideBubble: jest.fn(),
  minimizeWindow: jest.fn(),
  moveCharacterBy: jest.fn(() => Promise.resolve()),
  notifyCharacterMouse: jest.fn(),
  onBubbleData: jest.fn(() => () => {}),
  onBubbleTail: jest.fn(() => () => {}),
  onSetTab: jest.fn(() => () => {}),
  quitApp: jest.fn(),
  resolveAssetUrl: jest.fn(() => Promise.resolve("asset://mock")),
  showBubble: jest.fn(),
  showMainChatWindow: jest.fn(),
  showMainSettingsWindow: jest.fn(),
  showChatWindow: jest.fn(() => Promise.resolve()),
  showSettingsWindow: jest.fn(() => Promise.resolve()),
  toggleCharacterPinned: jest.fn(() => Promise.resolve({ pinned: true })),
  toggleMaximizeWindow: jest.fn()
};
