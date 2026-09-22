"use strict";

const { Menu, app } = require("electron");
const { t } = require("./i18n");

/**
 * 네이티브 메뉴를 구성한다 (한국어 로캘이면 한글, 그 외에는 영어).
 * 실제 동작은 renderer 로 'menu:action' 이벤트를 보내 처리하고(파일 열기/내보내기/초기화 등),
 * 앱 종료·확대/축소 등 OS 표준 동작만 role 로 위임한다.
 */
function buildMenu(mainWindow, locale) {
  const send = (action) => mainWindow && mainWindow.webContents.send("menu:action", action);
  const isMac = process.platform === "darwin";
  const L = (key) => t(locale, key);

  const template = [
    ...(isMac
      ? [
          {
            label: app.getName(),
            submenu: [
              { role: "about", label: L("aboutSkyDiff") },
              { type: "separator" },
              { role: "services", label: L("services") },
              { type: "separator" },
              { role: "hide", label: L("hideApp") },
              { role: "hideOthers", label: L("hideOthers") },
              { role: "unhide", label: L("unhide") },
              { type: "separator" },
              { role: "quit", label: L("quitApp") }
            ]
          }
        ]
      : []),
    {
      label: L("fileMenu"),
      submenu: [
        { label: L("newComparison"), accelerator: "CmdOrCtrl+N", click: () => send("new") },
        { type: "separator" },
        { label: L("openOriginal"), accelerator: "CmdOrCtrl+O", click: () => send("open-original") },
        { label: L("openModified"), accelerator: "CmdOrCtrl+Shift+O", click: () => send("open-modified") },
        { type: "separator" },
        { label: L("exportResult"), accelerator: "CmdOrCtrl+E", click: () => send("export") },
        { label: L("saveResult"), accelerator: "CmdOrCtrl+S", click: () => send("save") },
        { type: "separator" },
        isMac ? { role: "close", label: L("closeWindow") } : { role: "quit", label: L("quit") }
      ]
    },
    {
      label: L("editMenu"),
      submenu: [
        { label: L("reset"), accelerator: "CmdOrCtrl+R", click: () => send("reset") },
        { type: "separator" },
        { role: "undo", label: L("undo") },
        { role: "redo", label: L("redo") },
        { type: "separator" },
        { role: "cut", label: L("cut") },
        { role: "copy", label: L("copy") },
        { role: "paste", label: L("paste") },
        { role: "selectAll", label: L("selectAll") }
      ]
    },
    {
      label: L("viewMenu"),
      submenu: [
        { label: L("layoutSideBySide"), accelerator: "CmdOrCtrl+1", click: () => send("layout-side-by-side") },
        { label: L("layoutUnified"), accelerator: "CmdOrCtrl+2", click: () => send("layout-unified") },
        { type: "separator" },
        { role: "resetZoom", label: L("actualSize") },
        { role: "zoomIn", label: L("zoomIn") },
        { role: "zoomOut", label: L("zoomOut") },
        { type: "separator" },
        { role: "togglefullscreen", label: L("toggleFullScreen") }
      ]
    },
    {
      label: L("helpMenu"),
      submenu: [{ label: L("aboutSkyDiff"), click: () => send("about") }]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = { buildMenu };
