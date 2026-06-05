// Electron preload — يكشف جسر صغير وآمن للواجهة لاكتشاف بيئة Electron
// وإعادة تشغيل local-server من داخل التطبيق.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hnElectron", {
  isElectron: true,
  version: process.versions.electron,
  localServerUrl: "http://localhost:5174",
  restartLocalServer: () => ipcRenderer.invoke("hn:restart-local-server"),
  openExternal: (url) => ipcRenderer.invoke("hn:open-external", url),
});
