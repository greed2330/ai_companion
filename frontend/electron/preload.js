const { contextBridge, ipcRenderer } = require("electron");

function createListener(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("hanaDesktop", {
  closeWindow() {
    return ipcRenderer.invoke("window:close");
  },
  finishCharacterDrag() {
    return ipcRenderer.invoke("character:finish-drag");
  },
  getAppSettings() {
    return ipcRenderer.invoke("app-settings:get");
  },
  getCharacterBounds() {
    return ipcRenderer.invoke("character:get-bounds");
  },
  getCharacterState() {
    return ipcRenderer.invoke("character:get-state");
  },
  hideBubble() {
    ipcRenderer.send("hide-bubble");
  },
  minimizeWindow() {
    return ipcRenderer.invoke("window:minimize");
  },
  moveCharacterBy(deltaX, deltaY) {
    return ipcRenderer.invoke("character:move-by", deltaX, deltaY);
  },
  notifyAiNameChanged(name) {
    ipcRenderer.send("ai-name-changed", name);
  },
  notifyCharacterMouse(isInside) {
    ipcRenderer.send(isInside ? "char-mouse-enter" : "char-mouse-leave");
  },
  onBubbleData(callback) {
    return createListener("bubble-data", callback);
  },
  onBubbleTail(callback) {
    return createListener("bubble-tail", callback);
  },
  onSetTab(callback) {
    return createListener("set-tab", callback);
  },
  quitApp() {
    return ipcRenderer.invoke("app:quit");
  },
  resolveAssetUrl(relativePath) {
    return ipcRenderer.invoke("assets:resolve-url", relativePath);
  },
  saveAppSettings(payload) {
    return ipcRenderer.invoke("app-settings:save", payload);
  },
  showBubble(payload) {
    ipcRenderer.send("show-bubble", payload);
  },
  showChatWindow() {
    ipcRenderer.send("open-main-chat");
  },
  showMainChatWindow() {
    ipcRenderer.send("open-main-chat");
  },
  showMainSettingsWindow() {
    ipcRenderer.send("open-main-settings");
  },
  showSettingsWindow() {
    ipcRenderer.send("open-main-settings");
  },
  toggleCharacterPinned() {
    return ipcRenderer.invoke("character:toggle-pin");
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke("window:maximize-toggle");
  }
});
