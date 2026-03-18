const { contextBridge, ipcRenderer } = require("electron");

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
  }
});
