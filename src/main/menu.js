"use strict";

const { Menu, app, shell } = require("electron");

/**
 * 한글 네이티브 메뉴를 구성한다. 실제 동작은 renderer 로 'menu:action' 이벤트를 보내
 * 처리하고(파일 열기/내보내기/초기화 등), 앱 종료·확대/축소 등 OS 표준 동작만 role 로 위임한다.
 */
function buildMenu(mainWindow) {
  const send = (action) => mainWindow && mainWindow.webContents.send("menu:action", action);
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.getName(),
            submenu: [
              { role: "about", label: "SkyDiff 정보" },
              { type: "separator" },
              { role: "services", label: "서비스" },
              { type: "separator" },
              { role: "hide", label: "SkyDiff 가리기" },
              { role: "hideOthers", label: "다른 항목 가리기" },
              { role: "unhide", label: "모두 보기" },
              { type: "separator" },
              { role: "quit", label: "SkyDiff 종료" }
            ]
          }
        ]
      : []),
    {
      label: "파일(&F)",
      submenu: [
        { label: "새 비교", accelerator: "CmdOrCtrl+N", click: () => send("new") },
        { type: "separator" },
        { label: "원본 파일 열기...", accelerator: "CmdOrCtrl+O", click: () => send("open-original") },
        { label: "수정본 파일 열기...", accelerator: "CmdOrCtrl+Shift+O", click: () => send("open-modified") },
        { type: "separator" },
        { label: "비교 결과 내보내기...", accelerator: "CmdOrCtrl+E", click: () => send("export") },
        { label: "비교 결과 저장", accelerator: "CmdOrCtrl+S", click: () => send("save") },
        { type: "separator" },
        isMac ? { role: "close", label: "창 닫기" } : { role: "quit", label: "종료" }
      ]
    },
    {
      label: "편집(&E)",
      submenu: [
        { label: "초기화", accelerator: "CmdOrCtrl+R", click: () => send("reset") },
        { type: "separator" },
        { role: "undo", label: "실행 취소" },
        { role: "redo", label: "다시 실행" },
        { type: "separator" },
        { role: "cut", label: "잘라내기" },
        { role: "copy", label: "복사" },
        { role: "paste", label: "붙여넣기" },
        { role: "selectAll", label: "전체 선택" }
      ]
    },
    {
      label: "보기(&V)",
      submenu: [
        { label: "나란히 보기", accelerator: "CmdOrCtrl+1", click: () => send("layout-side-by-side") },
        { label: "합쳐 보기", accelerator: "CmdOrCtrl+2", click: () => send("layout-unified") },
        { type: "separator" },
        { label: "다크 모드 전환", accelerator: "CmdOrCtrl+D", click: () => send("toggle-dark-mode") },
        { type: "separator" },
        { role: "resetZoom", label: "실제 크기" },
        { role: "zoomIn", label: "확대" },
        { role: "zoomOut", label: "축소" },
        { type: "separator" },
        { role: "togglefullscreen", label: "전체 화면 전환" },
        { role: "toggleDevTools", label: "개발자 도구" }
      ]
    },
    {
      label: "도움말(&H)",
      submenu: [
        { label: "SkyDiff 정보", click: () => send("about") },
        { label: "업데이트 확인", click: () => send("check-update") },
        { type: "separator" },
        {
          label: "GitHub 저장소 열기",
          click: () => shell.openExternal("https://github.com/3rdappsmod/SkyDiff")
        },
        {
          label: "문제 보고",
          click: () => shell.openExternal("https://github.com/3rdappsmod/SkyDiff/issues")
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = { buildMenu };
