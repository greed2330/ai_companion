import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
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
