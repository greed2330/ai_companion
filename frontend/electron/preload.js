const { contextBridge, ipcRenderer } = require("electron");

function createListener(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("hanaDesktop", {
  resolveAssetUrl(relativePath) {
    return ipcRenderer.invoke("assets:resolve-url", relativePath);
  },
  minimizeWindow() {
    return ipcRenderer.invoke("window:minimize");
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke("window:maximize-toggle");
  },
  closeWindow() {
    return ipcRenderer.invoke("window:close");
  },
  showBubble(payload) {
    ipcRenderer.send("show-bubble", payload);
  },
  hideBubble() {
    ipcRenderer.send("hide-bubble");
  },
  onBubbleData(callback) {
    return createListener("bubble-data", callback);
  },
  onBubbleTail(callback) {
    return createListener("bubble-tail", callback);
  },
  notifyCharacterMouse(isInside) {
    ipcRenderer.send(isInside ? "char-mouse-enter" : "char-mouse-leave");
  },
  moveCharacterBy(deltaX, deltaY) {
    return ipcRenderer.invoke("character:move-by", deltaX, deltaY);
  },
  finishCharacterDrag() {
    return ipcRenderer.invoke("character:finish-drag");
  },
  getCharacterBounds() {
    return ipcRenderer.invoke("character:get-bounds");
  },
  getCharacterState() {
    return ipcRenderer.invoke("character:get-state");
  },
  toggleCharacterPinned() {
    return ipcRenderer.invoke("character:toggle-pin");
  },
  showChatWindow() {
    return ipcRenderer.invoke("window:show-chat");
  },
  showSettingsWindow() {
    return ipcRenderer.invoke("window:show-settings");
  },
  quitApp() {
    return ipcRenderer.invoke("app:quit");
  }
});
