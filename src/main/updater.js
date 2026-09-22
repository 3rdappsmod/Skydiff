"use strict";

const { autoUpdater } = require("electron-updater");

/**
 * GitHub Releases 기반 자동 업데이트. release.yml 워크플로가 태그 푸시 시
 * electron-builder --publish 로 릴리스를 올리면, 배포된 앱이 시작 시 자동으로 확인한다.
 */
function setupAutoUpdater(mainWindow) {
  autoUpdater.autoDownload = true;

  const send = (message, type, data) =>
    mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send("update:status", { message, type, data });

  autoUpdater.on("checking-for-update", () => send("업데이트 확인 중...", "checking"));
  autoUpdater.on("update-available", (info) => send("새 버전이 있습니다", "available", info));
  autoUpdater.on("update-not-available", () => send("최신 버전입니다", "not-available"));
  autoUpdater.on("error", (err) => send("업데이트 확인 실패: " + err.message, "error"));
  autoUpdater.on("download-progress", (progress) => send("다운로드 중...", "progress", progress));
  autoUpdater.on("update-downloaded", (info) => send("업데이트 준비 완료 (재시작 시 적용)", "downloaded", info));

  return {
    checkForUpdates: () => autoUpdater.checkForUpdates().catch((err) => send("업데이트 확인 실패: " + err.message, "error")),
    quitAndInstall: () => autoUpdater.quitAndInstall()
  };
}

module.exports = { setupAutoUpdater };
