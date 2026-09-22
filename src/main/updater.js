"use strict";

const { autoUpdater } = require("electron-updater");
const { t } = require("./i18n");

/**
 * GitHub Releases 기반 자동 업데이트. release.yml 워크플로가 태그 푸시 시
 * electron-builder --publish 로 릴리스를 올리면, 배포된 앱이 시작 시 자동으로 확인한다.
 */
function setupAutoUpdater(mainWindow, locale) {
  autoUpdater.autoDownload = true;
  const L = (key) => t(locale, key);

  const send = (message, type, data) =>
    mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send("update:status", { message, type, data });

  autoUpdater.on("checking-for-update", () => send(L("updateChecking"), "checking"));
  autoUpdater.on("update-available", (info) => send(L("updateAvailable"), "available", info));
  autoUpdater.on("update-not-available", () => send(L("updateNotAvailable"), "not-available"));
  autoUpdater.on("error", (err) => send(L("updateCheckFailed") + err.message, "error"));
  autoUpdater.on("download-progress", (progress) => send(L("updateDownloading"), "progress", progress));
  autoUpdater.on("update-downloaded", (info) => send(L("updateDownloaded"), "downloaded", info));

  return {
    checkForUpdates: () => autoUpdater.checkForUpdates().catch((err) => send(L("updateCheckFailed") + err.message, "error")),
    quitAndInstall: () => autoUpdater.quitAndInstall()
  };
}

module.exports = { setupAutoUpdater };
