const { contextBridge, ipcRenderer } = require("electron");

const listen = (channel, callback) => {
  const subscription = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
};

// Fenster-Steuerung
const windowControls = {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close")
};

contextBridge.exposeInMainWorld("ytx", {
  getState: () => ipcRenderer.invoke("app:get-state"),
  setTheme: (theme) => ipcRenderer.invoke("app:set-theme", theme),
  selectFolder: () => ipcRenderer.invoke("dialog:select-folder"),
  startDownload: (options) => ipcRenderer.invoke("download:start", options),
  cancelDownload: () => ipcRenderer.invoke("download:cancel"),
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath),
  onStarted: (callback) => listen("download:started", callback),
  onProgress: (callback) => listen("download:progress", callback),
  onLog: (callback) => listen("download:log", callback),
  onCompleted: (callback) => listen("download:completed", callback),
  onFailed: (callback) => listen("download:failed", callback)
});

// Expose window controls für Vela App
contextBridge.exposeInMainWorld("electron", windowControls);
