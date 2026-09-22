"use strict";

/**
 * 초경량 i18n. 한국어 로캘이면 ko(=HTML 원문), 그 외에는 자동으로 en 을 사용한다.
 * index.html 의 data-i18n / data-i18n-placeholder / data-i18n-title / data-i18n-value 를 치환한다.
 */
(function (global) {
  const STRINGS = {
    toggleSidebar: { ko: "사이드바 접기/펼치기", en: "Toggle sidebar" },
    untitledDiff: { ko: "제목 없는 비교", en: "Untitled diff" },

    reset: { ko: "초기화", en: "Reset" },
    export: { ko: "내보내기", en: "Export" },
    save: { ko: "저장", en: "Save" },
    share: { ko: "공유", en: "Share" },
    description: { ko: "설명", en: "Description" },

    display: { ko: "표시", en: "Display" },
    layout: { ko: "레이아웃", en: "Layout" },
    layoutSideBySide: { ko: "나란히 보기", en: "Side by side" },
    layoutUnified: { ko: "합쳐 보기", en: "Unified" },
    liveEdit: { ko: "실시간 편집", en: "Live edit" },
    ignoreWhitespace: { ko: "줄 앞뒤 공백 무시", en: "Ignore leading/trailing whitespace" },
    hideUnchanged: { ko: "변경 없는 행 숨기기", en: "Hide unchanged lines" },
    disableWordWrap: { ko: "줄바꿈 비활성화", en: "Disable word wrap" },
    granularity: { ko: "비교 단위", en: "Comparison granularity" },
    granularitySmart: { ko: "스마트", en: "Smart" },
    granularityLine: { ko: "줄 단위", en: "Line" },
    granularityWord: { ko: "단어 단위", en: "Word" },
    granularityChar: { ko: "문자 단위", en: "Character" },
    syntax: { ko: "구문", en: "Syntax" },
    syntaxNone: { ko: "없음", en: "None" },

    appearance: { ko: "모양 변경", en: "Appearance" },
    addedColor: { ko: "추가된 내용 색상", en: "Added color" },
    removedColor: { ko: "삭제된 내용 색상", en: "Removed color" },
    resetColors: { ko: "기본값으로 재설정", en: "Reset to defaults" },

    processing: { ko: "처리", en: "Processing" },
    exclude: { ko: "제외", en: "Exclude" },
    excludeHint: {
      ko: "비교에서 제외할 패턴을 추가하세요. (일반 텍스트 또는 정규식)",
      en: "Add patterns to exclude from the comparison. (plain text or regex)"
    },
    addPattern: { ko: "+ 패턴 추가", en: "+ Add pattern" },
    patternPlaceholder: { ko: "패턴 입력...", en: "Enter a pattern..." },
    regex: { ko: "정규식", en: "Regex" },
    delete: { ko: "삭제", en: "Delete" },
    textTransform: { ko: "텍스트 변환", en: "Text transform" },
    trimLines: { ko: "앞뒤 공백 제거", en: "Trim lines" },
    ignoreCase: { ko: "대소문자 무시", en: "Ignore case" },
    removeEmptyLines: { ko: "빈 줄 제거", en: "Remove empty lines" },
    sortLines: { ko: "줄 정렬", en: "Sort lines" },

    firstChange: { ko: "첫 변경으로", en: "First change" },

    savedComparisons: { ko: "저장된 비교 결과", en: "Saved comparisons" },
    noSavedComparisons: { ko: "저장한 비교 결과가 여기에 표시됩니다.", en: "Comparisons you save will appear here." },

    original: { ko: "원본", en: "Original" },
    modified: { ko: "수정본", en: "Modified" },
    openFile: { ko: "파일 열기", en: "Open file" },
    compare: { ko: "비교하기", en: "Compare" },
    swapSides: { ko: "원본/수정본 바꾸기", en: "Swap original/modified" },
    copy: { ko: "복사", en: "Copy" },

    deletedCount: { ko: "{n} 삭제", en: "{n} deletion(s)" },
    addedCount: { ko: "{n} 추가", en: "{n} addition(s)" },

    cancel: { ko: "취소", en: "Cancel" },
    close: { ko: "닫기", en: "Close" },
    descriptionPlaceholder: { ko: "이 비교에 대한 설명을 입력하세요...", en: "Enter a description for this comparison..." },
    version: { ko: "버전", en: "Version" },
    aboutDescription: {
      ko: "하늘색 테마의 크로스플랫폼 텍스트 비교(diff) 프로그램입니다.",
      en: "A cross-platform text comparison (diff) app with a sky-blue theme."
    },
    aboutLibs: { ko: "사용 라이브러리: Monaco Editor, jsdiff, Electron", en: "Built with Monaco Editor, jsdiff, Electron" },
    githubRepo: { ko: "GitHub 저장소", en: "GitHub repository" },

    enterTextToCompare: { ko: "비교할 텍스트를 입력해주세요.", en: "Please enter text to compare." },
    textsIdentical: { ko: "두 텍스트가 동일합니다.", en: "The two texts are identical." },
    emptyStatePlaceholder: {
      ko: "원본과 수정본을 입력하면 비교 결과가 여기에 표시됩니다.",
      en: "Enter the original and modified text to see the comparison here."
    },
    nothingToSave: { ko: "저장할 내용이 없습니다.", en: "There's nothing to save." },
    comparisonSaved: { ko: "비교 결과를 저장했습니다.", en: "Comparison saved." },
    nothingToExport: { ko: "내보낼 내용이 없습니다.", en: "There's nothing to export." },
    exportComplete: { ko: "내보내기가 완료되었습니다.", en: "Export complete." },
    runCompareFirst: { ko: "먼저 비교를 실행해주세요.", en: "Please run a comparison first." },
    copiedToClipboard: { ko: "비교 결과를 클립보드에 복사했습니다.", en: "Comparison copied to clipboard." },
    descriptionSaved: { ko: "설명을 저장했습니다.", en: "Description saved." },
    originalCopied: { ko: "원본을 복사했습니다.", en: "Original copied." },
    modifiedCopied: { ko: "수정본을 복사했습니다.", en: "Modified copied." },
    githubUrlCopied: { ko: "GitHub 주소를 클립보드에 복사했습니다.", en: "GitHub URL copied to clipboard." },

    unchangedLinesHidden: { ko: "⋯ 변경 없는 {n}줄 표시 ⋯", en: "⋯ show {n} unchanged line(s) ⋯" }
  };

  let currentLocale = "ko";

  function t(key, params) {
    const entry = STRINGS[key];
    if (!entry) return key;
    let str = entry[currentLocale] || entry.ko;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp("\\{" + k + "\\}", "g"), v);
      }
    }
    return str;
  }

  function applyDom() {
    document.documentElement.lang = currentLocale;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll("[data-i18n-value]").forEach((el) => {
      el.value = t(el.dataset.i18nValue);
    });
  }

  function init(locale) {
    currentLocale = locale === "ko" ? "ko" : "en";
    applyDom();
  }

  global.SkyDiffI18n = { init, t, get locale() { return currentLocale; } };
})(window);
