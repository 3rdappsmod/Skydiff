"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("skydiff", {
  openTextFile: () => ipcRenderer.invoke("dialog:open-text-file"),
  saveTextFile: (defaultName, content) => ipcRenderer.invoke("dialog:save-text-file", { defaultName, content }),

  getSettings: () => ipcRenderer.invoke("store:get-settings"),
  setSettings: (settings) => ipcRenderer.invoke("store:set-settings", settings),

  getComparisons: () => ipcRenderer.invoke("store:get-comparisons"),
  saveComparison: (comparison) => ipcRenderer.invoke("store:save-comparison", comparison),
  deleteComparison: (id) => ipcRenderer.invoke("store:delete-comparison", id),

  writeClipboard: (text) => ipcRenderer.invoke("clipboard:write-text", text),
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  getLocale: () => ipcRenderer.invoke("app:get-locale"),

  // 드래그앤드롭된 File 객체는 sandbox 렌더러에서 실제 경로를 알 수 없으므로
  // Electron 이 제공하는 webUtils 로 절대 경로를 얻는다 (내용은 렌더러의 FileReader 로 읽음).
  getPathForFile: (file) => webUtils.getPathForFile(file),

  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("menu:action", handler);
    return () => ipcRenderer.removeListener("menu:action", handler);
  },

  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  }
});
