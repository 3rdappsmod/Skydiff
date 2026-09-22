"use strict";

/**
 * 메인 프로세스(네이티브 메뉴, 파일 다이얼로그)용 최소 i18n.
 * 한국어 로캘이면 ko, 그 외에는 자동으로 en 을 사용한다.
 */

const STRINGS = {
  ko: {
    // 메뉴 - 파일
    fileMenu: "파일(&F)",
    newComparison: "새 비교",
    openOriginal: "원본 파일 열기...",
    openModified: "수정본 파일 열기...",
    exportResult: "비교 결과 내보내기...",
    saveResult: "비교 결과 저장",
    closeWindow: "창 닫기",
    quit: "종료",
    // 메뉴 - 편집
    editMenu: "편집(&E)",
    reset: "초기화",
    undo: "실행 취소",
    redo: "다시 실행",
    cut: "잘라내기",
    copy: "복사",
    paste: "붙여넣기",
    selectAll: "전체 선택",
    // 메뉴 - 보기
    viewMenu: "보기(&V)",
    layoutSideBySide: "나란히 보기",
    layoutUnified: "합쳐 보기",
    actualSize: "실제 크기",
    zoomIn: "확대",
    zoomOut: "축소",
    toggleFullScreen: "전체 화면 전환",
    // 메뉴 - 도움말
    helpMenu: "도움말(&H)",
    aboutSkyDiff: "SkyDiff 정보",
    // macOS 앱 메뉴
    services: "서비스",
    hideApp: "SkyDiff 가리기",
    hideOthers: "다른 항목 가리기",
    unhide: "모두 보기",
    quitApp: "SkyDiff 종료",
    // 파일 다이얼로그
    textFiles: "텍스트 파일",
    allFiles: "모든 파일",
    openTextFileTitle: "텍스트 파일 열기",
    saveAsTitle: "다른 이름으로 저장",
    diffPatchFiles: "Diff 패치 파일",
    htmlFiles: "HTML 파일",
    // 자동 업데이트
    updateChecking: "업데이트 확인 중...",
    updateAvailable: "새 버전이 있습니다",
    updateNotAvailable: "최신 버전입니다",
    updateCheckFailed: "업데이트 확인 실패: ",
    updateDownloading: "다운로드 중...",
    updateDownloaded: "업데이트 준비 완료 (재시작 시 적용)"
  },
  en: {
    fileMenu: "&File",
    newComparison: "New Comparison",
    openOriginal: "Open Original...",
    openModified: "Open Modified...",
    exportResult: "Export Comparison...",
    saveResult: "Save Comparison",
    closeWindow: "Close Window",
    quit: "Quit",
    editMenu: "&Edit",
    reset: "Reset",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    viewMenu: "&View",
    layoutSideBySide: "Side by Side",
    layoutUnified: "Unified",
    actualSize: "Actual Size",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    toggleFullScreen: "Toggle Full Screen",
    helpMenu: "&Help",
    aboutSkyDiff: "About SkyDiff",
    services: "Services",
    hideApp: "Hide SkyDiff",
    hideOthers: "Hide Others",
    unhide: "Show All",
    quitApp: "Quit SkyDiff",
    textFiles: "Text Files",
    allFiles: "All Files",
    openTextFileTitle: "Open Text File",
    saveAsTitle: "Save As",
    diffPatchFiles: "Diff Patch Files",
    htmlFiles: "HTML Files",
    updateChecking: "Checking for updates...",
    updateAvailable: "A new version is available",
    updateNotAvailable: "You're on the latest version",
    updateCheckFailed: "Update check failed: ",
    updateDownloading: "Downloading...",
    updateDownloaded: "Update ready (applies on restart)"
  }
};

function resolveLocale(rawLocale) {
  return rawLocale && rawLocale.toLowerCase().startsWith("ko") ? "ko" : "en";
}

function t(locale, key) {
  const dict = STRINGS[locale] || STRINGS.en;
  return dict[key] || STRINGS.en[key] || key;
}

module.exports = { resolveLocale, t };
