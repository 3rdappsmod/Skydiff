"use strict";

const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const store = require("./store");
const { buildMenu } = require("./menu");
const { setupAutoUpdater } = require("./updater");

const appIconPng = path.join(__dirname, "..", "..", "assets", "icons", "512x512.png");

let mainWindow = null;
let updater = null;

const TEXT_FILE_FILTERS = [
  { name: "텍스트 파일", extensions: ["txt", "md", "json", "js", "ts", "jsx", "tsx", "html", "css", "xml", "yml", "yaml", "csv", "log"] },
  { name: "모든 파일", extensions: ["*"] }
];

function createWindow() {
  const bounds = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f0f9ff",
    icon: appIconPng,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (bounds.maximized) mainWindow.maximize();

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  const persistBounds = () => {
    if (!mainWindow) return;
    const maximized = mainWindow.isMaximized();
    const b = mainWindow.getBounds();
    store.set("windowBounds", { ...b, maximized });
  };
  mainWindow.on("resize", persistBounds);
  mainWindow.on("move", persistBounds);
  mainWindow.on("close", persistBounds);

  buildMenu(mainWindow);
  updater = setupAutoUpdater(mainWindow);

  mainWindow.webContents.on("did-finish-load", () => {
    if (!app.isPackaged) return;
    updater.checkForUpdates();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---- IPC: 파일 다이얼로그 ----

ipcMain.handle("dialog:open-text-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "텍스트 파일 열기",
    properties: ["openFile"],
    filters: TEXT_FILE_FILTERS
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf-8");
  return { canceled: false, filePath, fileName: path.basename(filePath), content };
});

ipcMain.handle("dialog:save-text-file", async (_event, { defaultName, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "다른 이름으로 저장",
    defaultPath: defaultName || "diff.txt",
    filters: [
      { name: "텍스트 파일", extensions: ["txt"] },
      { name: "Diff 패치 파일", extensions: ["diff", "patch"] },
      { name: "HTML 파일", extensions: ["html"] },
      { name: "모든 파일", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  fs.writeFileSync(result.filePath, content, "utf-8");
  return { canceled: false, filePath: result.filePath };
});

// ---- IPC: 설정/저장된 비교 결과 (electron-store) ----

ipcMain.handle("store:get-settings", () => store.get("settings"));

ipcMain.handle("store:set-settings", (_event, settings) => {
  store.set("settings", { ...store.get("settings"), ...settings });
  return store.get("settings");
});

ipcMain.handle("store:get-comparisons", () => store.get("comparisons"));

ipcMain.handle("store:save-comparison", (_event, comparison) => {
  const list = store.get("comparisons");
  const now = new Date().toISOString();

  if (comparison.id) {
    const idx = list.findIndex((c) => c.id === comparison.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...comparison, updatedAt: now };
      store.set("comparisons", list);
      return list;
    }
  }

  const entry = {
    ...comparison,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  };
  store.set("comparisons", [entry, ...list]);
  return store.get("comparisons");
});

ipcMain.handle("store:delete-comparison", (_event, id) => {
  const list = store.get("comparisons").filter((c) => c.id !== id);
  store.set("comparisons", list);
  return list;
});

// ---- IPC: 기타 ----

ipcMain.handle("clipboard:write-text", (_event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle("app:get-version", () => app.getVersion());

ipcMain.handle("update:check", () => {
  if (updater) updater.checkForUpdates();
});

ipcMain.handle("theme:get-native-should-use-dark", () => nativeTheme.shouldUseDarkColors);
