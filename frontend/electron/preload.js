const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hanaDesktop", {
  resolveAssetUrl(relativePath) {
    return ipcRenderer.invoke("assets:resolve-url", relativePath);
  }
});
