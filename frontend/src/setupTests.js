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

class MockEventSource {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
  }

  close() {}
}

class MockAudioContext {
  constructor() {
    this.destination = {};
  }

  createMediaElementSource() {
    return { connect: jest.fn() };
  }

  createAnalyser() {
    return {
      fftSize: 0,
      frequencyBinCount: 128,
      connect: jest.fn(),
      getByteFrequencyData: jest.fn((data) => data.fill(64))
    };
  }

  decodeAudioData() {
    return Promise.resolve({
      sampleRate: 16000,
      getChannelData: () => new Float32Array(1600).fill(0.02)
    });
  }

  close() {
    return Promise.resolve();
  }
}

class MockMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.ondataavailable = null;
    this.onstop = null;
  }

  start() {}

  stop() {
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/wav" }) });
    this.onstop?.();
  }
}

class MockAudio {
  constructor(url) {
    this.url = url;
    this.onplay = null;
    this.onended = null;
  }

  play() {
    this.onplay?.();
    this.onended?.();
    return Promise.resolve();
  }

  pause() {}
}

class MockSpeechRecognition {
  constructor() {
    this.lang = "ko-KR";
    this.onresult = null;
    this.onerror = null;
  }

  start() {
    this.onresult?.({
      results: [[{ transcript: "테스트 음성" }]]
    });
  }
}

global.Audio = MockAudio;
global.AudioContext = MockAudioContext;
global.EventSource = MockEventSource;
global.MediaRecorder = MockMediaRecorder;
global.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
    this.lang = "ko-KR";
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.onstart = null;
    this.onend = null;
  }
};
window.SpeechRecognition = MockSpeechRecognition;
window.webkitSpeechRecognition = MockSpeechRecognition;
window.speechSynthesis = {
  speak: jest.fn((utterance) => {
    utterance.onstart?.();
    utterance.onend?.();
  }),
  cancel: jest.fn()
};
window.__pendingTTSParams = {};
global.URL.createObjectURL = jest.fn(() => "blob:mock");
global.URL.revokeObjectURL = jest.fn();
Object.defineProperty(global.navigator, "mediaDevices", {
  value: {
    getUserMedia: jest.fn(() =>
      Promise.resolve({
        getTracks: () => [{ stop: jest.fn() }]
      })
    )
  },
  configurable: true
});

window.__VITE_API_BASE_URL__ = "http://test";
window.hanaDesktop = {
  charPositionApply: jest.fn(),
  charViewportOpacity: jest.fn(),
  charViewportSize: jest.fn(),
  closeWindow: jest.fn(),
  endCharacterDrag: jest.fn(),
  finishCharacterDrag: jest.fn(() => Promise.resolve()),
  getAppSettings: jest.fn(() =>
    Promise.resolve({
      app: { theme: "dark-anime", shortcut: "Alt+H", autoLaunch: false },
      character: { viewportScale: 100 },
      integrations: {
        serper: { status: "grey", apiKey: "" },
        google_calendar: { status: "grey", apiKey: "" },
        github: { status: "grey", apiKey: "" }
      },
      voice: { inputMode: "text", outputMode: "chat", ttsEnabled: false }
    })
  ),
  getCharacterBounds: jest.fn(() =>
    Promise.resolve({ x: 100, y: 100, width: 300, height: 400 })
  ),
  getCharacterWindowPlacement: jest.fn(() =>
    Promise.resolve({ x: 88, y: 50, size: "M" })
  ),
  getCharacterState: jest.fn(() => Promise.resolve({ pinned: false })),
  hideBubble: jest.fn(),
  minimizeWindow: jest.fn(),
  moveCharacterBy: jest.fn(() => Promise.resolve()),
  startCharacterDrag: jest.fn(),
  notifyAiNameChanged: jest.fn(),
  notifyCharacterMouse: jest.fn(),
  openCharPositionPopup: jest.fn(),
  onBubbleData: jest.fn(() => () => {}),
  onBubbleTail: jest.fn(() => () => {}),
  onCharacterSettingsUpdated: jest.fn(() => () => {}),
  onSetTab: jest.fn(() => () => {}),
  quitApp: jest.fn(),
  resolveAssetUrl: jest.fn(() => Promise.resolve("asset://mock")),
  saveAppSettings: jest.fn((payload) => Promise.resolve(payload)),
  setAutoLaunch: jest.fn(),
  settingsSaved: jest.fn(),
  showBubble: jest.fn(),
  showMainChatWindow: jest.fn(),
  showMainSettingsWindow: jest.fn(),
  showChatWindow: jest.fn(() => Promise.resolve()),
  showSettingsWindow: jest.fn(() => Promise.resolve()),
  toggleCharacterPinned: jest.fn(() => Promise.resolve({ pinned: true })),
  toggleMaximizeWindow: jest.fn(),
  windowHide: jest.fn(),
  windowMinimize: jest.fn()
};
