"use strict";

(function () {
  const state = {
    settings: null,
    title: "",
    description: "",
    currentComparisonId: null,
    lastDiffResult: null,
    compared: false
  };

  let originalEditor = null;
  let modifiedEditor = null;
  let toastTimer = null;

  // ---------------- 유틸 ----------------

  function $(sel) {
    return document.querySelector(sel);
  }

  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function toast(message) {
    const t = $("#toast");
    t.textContent = message;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function showWarning(message) {
    const b = $("#warningBanner");
    b.textContent = message;
    b.classList.remove("hidden");
  }

  function hideWarning() {
    $("#warningBanner").classList.add("hidden");
  }

  function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
  }

  function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
  }

  // ---------------- 다크 모드 ----------------

  function applyTheme(isDark) {
    document.body.classList.toggle("theme-dark", isDark);
    document.body.classList.toggle("theme-light", !isDark);
    if (window.monaco) {
      window.monaco.editor.setTheme(isDark ? "skydiff-dark" : "skydiff-light");
    }
  }

  // ---------------- 설정 <-> UI ----------------

  function buildOptionsFromSettings() {
    return {
      granularity: state.settings.granularity,
      ignoreWhitespace: state.settings.ignoreWhitespace,
      hideUnchanged: state.settings.hideUnchanged,
      excludePatterns: state.settings.excludePatterns,
      textTransforms: state.settings.textTransforms
    };
  }

  function persistSettings() {
    window.skydiff.setSettings(state.settings);
  }

  function applySettingsToUI() {
    const s = state.settings;

    document.querySelectorAll("#layoutToggle .seg-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === s.layout);
    });

    $("#liveEditToggle").checked = !!s.liveEdit;
    $("#ignoreWhitespaceToggle").checked = !!s.ignoreWhitespace;
    $("#hideUnchangedToggle").checked = !!s.hideUnchanged;
    $("#wordWrapToggle").checked = !!s.wordWrap;
    $("#granularitySelect").value = s.granularity;
    $("#syntaxSelect").value = s.syntax;

    $("#colorAdded").value = s.colors.added;
    $("#colorRemoved").value = s.colors.removed;

    $("#tfTrim").checked = !!s.textTransforms.trimLines;
    $("#tfIgnoreCase").checked = !!s.textTransforms.ignoreCase;
    $("#tfRemoveEmpty").checked = !!s.textTransforms.removeEmptyLines;
    $("#tfSort").checked = !!s.textTransforms.sortLines;

    window.SkyDiffView.applyColors(s.colors.added, s.colors.addedBg, s.colors.removed, s.colors.removedBg);
    $("#diffContainer").classList.toggle("nowrap", !s.wordWrap);

    renderExcludeList();
    applyTheme(!!s.darkMode);
  }

  // ---------------- 에디터 ----------------

  function getEditorValues() {
    return { original: originalEditor.getValue(), modified: modifiedEditor.getValue() };
  }

  function setEditorValues(original, modified) {
    if (original !== undefined) originalEditor.setValue(original);
    if (modified !== undefined) modifiedEditor.setValue(modified);
  }

  function setLanguage(langId) {
    if (!window.monaco) return;
    window.monaco.editor.setModelLanguage(originalEditor.getModel(), langId);
    window.monaco.editor.setModelLanguage(modifiedEditor.getModel(), langId);
  }

  function defineThemes(monaco) {
    monaco.editor.defineTheme("skydiff-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#f7fbff",
        "editor.foreground": "#0f2647",
        "editorLineNumber.foreground": "#8fa9c7",
        "editorLineNumber.activeForeground": "#2563eb",
        "editor.lineHighlightBackground": "#e6f2ff",
        "editorCursor.foreground": "#2563eb",
        "editor.selectionBackground": "#bae6fd80"
      }
    });
    monaco.editor.defineTheme("skydiff-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0d1626",
        "editor.foreground": "#e6f1ff",
        "editorLineNumber.foreground": "#5b7699",
        "editorLineNumber.activeForeground": "#7dd3fc",
        "editor.lineHighlightBackground": "#111c30",
        "editorCursor.foreground": "#7dd3fc"
      }
    });
  }

  function createEditors(monaco) {
    defineThemes(monaco);

    const commonOptions = {
      value: "",
      language: state.settings.syntax,
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: state.settings.wordWrap ? "on" : "off",
      scrollBeyondLastLine: false,
      fontSize: 13,
      theme: state.settings.darkMode ? "skydiff-dark" : "skydiff-light",
      renderLineHighlight: "line"
    };

    originalEditor = monaco.editor.create(document.getElementById("originalEditor"), commonOptions);
    modifiedEditor = monaco.editor.create(document.getElementById("modifiedEditor"), { ...commonOptions });

    const onChange = debounce(() => {
      // '비교하기'를 한 번도 누르기 전에는 자동으로 결과를 보여주지 않는다.
      // 실시간 편집은 이미 비교한 이후에만, 계속 입력하는 동안 결과를 최신 상태로 갱신하는 용도다.
      if (!state.compared || !state.settings.liveEdit) return;
      runCompare({ manual: false });
    }, 350);

    originalEditor.onDidChangeModelContent(onChange);
    modifiedEditor.onDidChangeModelContent(onChange);
  }

  // ---------------- 비교 실행/렌더 ----------------

  function showDiffPlaceholder(message) {
    const container = $("#diffContainer");
    container.textContent = "";
    const p = document.createElement("p");
    p.className = "empty-hint";
    p.style.padding = "16px";
    p.textContent = message;
    container.appendChild(p);
  }

  function renderDiff() {
    if (!state.lastDiffResult) return;
    const container = $("#diffContainer");
    const onExpand = (placeholderRow) => {
      state.lastDiffResult.rows = window.SkyDiffView.expandPlaceholderInRows(state.lastDiffResult.rows, placeholderRow);
      renderDiff();
    };
    if (state.settings.layout === "unified") {
      window.SkyDiffView.renderUnified(container, state.lastDiffResult.rows, onExpand);
    } else {
      window.SkyDiffView.renderSideBySide(container, state.lastDiffResult.rows, onExpand);
    }
  }

  function updateStats(stats) {
    $("#statRemovedCount").textContent = window.SkyDiffI18n.t("deletedCount", { n: stats.removed });
    $("#statAddedCount").textContent = window.SkyDiffI18n.t("addedCount", { n: stats.added });
  }

  // 입력창은 항상 보이며, 비교 결과는 그 아래에 실시간으로 갱신된다 (화면 전환 없음).
  function runCompare({ manual } = {}) {
    const { original, modified } = getEditorValues();

    if (!original.trim() && !modified.trim()) {
      if (manual) showWarning(window.SkyDiffI18n.t("enterTextToCompare"));
      return;
    }

    hideWarning();
    const options = buildOptionsFromSettings();
    const result = window.SkyDiffEngine.compute(original, modified, options);
    state.lastDiffResult = result;
    state.compared = true;

    renderDiff();
    updateStats(result.stats);

    if (result.identical) showWarning(window.SkyDiffI18n.t("textsIdentical"));
  }

  function resetAll() {
    setEditorValues("", "");
    state.title = window.SkyDiffI18n.t("untitledDiff");
    state.description = "";
    state.currentComparisonId = null;
    state.lastDiffResult = null;
    state.compared = false;
    $("#titleInput").value = state.title;
    hideWarning();
    updateStats({ added: 0, removed: 0 });
    showDiffPlaceholder(window.SkyDiffI18n.t("emptyStatePlaceholder"));
  }

  // ---------------- 파일 열기 / 드래그앤드롭 ----------------

  async function openFileInto(targetEditor) {
    const result = await window.skydiff.openTextFile();
    if (result.canceled) return;
    targetEditor.setValue(result.content);
  }

  function wireDragAndDrop(hostEl, targetEditor) {
    hostEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      hostEl.classList.add("drag-hover");
    });
    hostEl.addEventListener("dragleave", () => hostEl.classList.remove("drag-hover"));
    hostEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      hostEl.classList.remove("drag-hover");
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      const text = await file.text();
      targetEditor.setValue(text);
    });
  }

  // ---------------- 제외 패턴 UI ----------------

  function renderExcludeList() {
    const list = $("#excludeList");
    list.textContent = "";
    state.settings.excludePatterns.forEach((rule, idx) => {
      const row = document.createElement("div");
      row.className = "exclude-row";

      const enabledCb = document.createElement("input");
      enabledCb.type = "checkbox";
      enabledCb.className = "switch";
      enabledCb.checked = !!rule.enabled;
      enabledCb.addEventListener("change", () => {
        state.settings.excludePatterns[idx].enabled = enabledCb.checked;
        onProcessingOptionChanged();
      });

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = window.SkyDiffI18n.t("patternPlaceholder");
      input.value = rule.pattern || "";
      input.addEventListener("input", () => {
        state.settings.excludePatterns[idx].pattern = input.value;
        onProcessingOptionChanged();
      });

      const regexLabel = document.createElement("label");
      const regexCb = document.createElement("input");
      regexCb.type = "checkbox";
      regexCb.checked = !!rule.isRegex;
      regexCb.addEventListener("change", () => {
        state.settings.excludePatterns[idx].isRegex = regexCb.checked;
        onProcessingOptionChanged();
      });
      regexLabel.appendChild(regexCb);
      regexLabel.appendChild(document.createTextNode(window.SkyDiffI18n.t("regex")));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn";
      delBtn.textContent = "×";
      delBtn.title = window.SkyDiffI18n.t("delete");
      delBtn.addEventListener("click", () => {
        state.settings.excludePatterns.splice(idx, 1);
        renderExcludeList();
        onProcessingOptionChanged();
      });

      row.appendChild(enabledCb);
      row.appendChild(input);
      row.appendChild(regexLabel);
      row.appendChild(delBtn);
      list.appendChild(row);
    });
  }

  function onProcessingOptionChanged() {
    persistSettings();
    if (state.compared) runCompare({ manual: false });
  }

  // ---------------- 저장된 비교 결과 ----------------

  function formatDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }

  async function refreshSavedList() {
    const list = await window.skydiff.getComparisons();
    const el = $("#savedList");
    el.textContent = "";

    if (!list || list.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-hint";
      p.textContent = window.SkyDiffI18n.t("noSavedComparisons");
      el.appendChild(p);
      return;
    }

    list.forEach((item) => {
      const row = document.createElement("div");
      row.className = "saved-item";

      const main = document.createElement("div");
      main.className = "saved-item-main";
      const title = document.createElement("div");
      title.className = "saved-item-title";
      title.textContent = item.title || window.SkyDiffI18n.t("untitledDiff");
      const date = document.createElement("div");
      date.className = "saved-item-date";
      date.textContent = formatDate(item.updatedAt || item.createdAt);
      main.appendChild(title);
      main.appendChild(date);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn";
      delBtn.textContent = "×";
      delBtn.title = window.SkyDiffI18n.t("delete");
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await window.skydiff.deleteComparison(item.id);
        refreshSavedList();
      });

      row.addEventListener("click", () => loadComparison(item));
      row.appendChild(main);
      row.appendChild(delBtn);
      el.appendChild(row);
    });
  }

  function loadComparison(item) {
    state.currentComparisonId = item.id;
    state.title = item.title || window.SkyDiffI18n.t("untitledDiff");
    state.description = item.description || "";
    $("#titleInput").value = state.title;
    setEditorValues(item.original || "", item.modified || "");
    if (item.settings) {
      state.settings = { ...state.settings, ...item.settings };
      applySettingsToUI();
      setLanguage(state.settings.syntax);
    }
    runCompare({ manual: true });
  }

  async function saveCurrentComparison() {
    const { original, modified } = getEditorValues();
    if (!original.trim() && !modified.trim()) {
      toast(window.SkyDiffI18n.t("nothingToSave"));
      return;
    }
    const payload = {
      id: state.currentComparisonId,
      title: state.title,
      description: state.description,
      original,
      modified,
      settings: state.settings
    };
    await window.skydiff.saveComparison(payload);
    toast(window.SkyDiffI18n.t("comparisonSaved"));
    refreshSavedList();
  }

  // ---------------- 내보내기 / 공유 / 복사 ----------------

  async function exportDiff() {
    const { original, modified } = getEditorValues();
    if (!original.trim() && !modified.trim()) {
      toast(window.SkyDiffI18n.t("nothingToExport"));
      return;
    }
    const originalLabel = window.SkyDiffI18n.t("original");
    const modifiedLabel = window.SkyDiffI18n.t("modified");
    const patch = window.SkyDiffEngine.toUnifiedPatch(original, modified, originalLabel, modifiedLabel);
    const result = await window.skydiff.saveTextFile((state.title || "diff") + ".diff", patch);
    if (!result.canceled) toast(window.SkyDiffI18n.t("exportComplete"));
  }

  async function shareDiff() {
    if (!state.lastDiffResult) {
      toast(window.SkyDiffI18n.t("runCompareFirst"));
      return;
    }
    const { stats } = state.lastDiffResult;
    const { original, modified } = getEditorValues();
    const originalLabel = window.SkyDiffI18n.t("original");
    const modifiedLabel = window.SkyDiffI18n.t("modified");
    const patch = window.SkyDiffEngine.toUnifiedPatch(original, modified, originalLabel, modifiedLabel);
    const statsLine = `(${window.SkyDiffI18n.t("deletedCount", { n: stats.removed })}, ${window.SkyDiffI18n.t("addedCount", { n: stats.added })})`;
    const summary = `${state.title} ${statsLine}\n\n${patch}`;
    await window.skydiff.writeClipboard(summary);
    toast(window.SkyDiffI18n.t("copiedToClipboard"));
  }

  // ---------------- 이벤트 바인딩 ----------------

  function wireEvents() {
    $("#btnCollapseSidebar").addEventListener("click", () => {
      $("#sidebar").classList.toggle("collapsed");
    });

    $("#titleInput").addEventListener("input", (e) => {
      state.title = e.target.value;
    });

    $("#btnReset").addEventListener("click", resetAll);
    $("#btnExport").addEventListener("click", exportDiff);
    $("#btnSave").addEventListener("click", saveCurrentComparison);
    $("#btnShare").addEventListener("click", shareDiff);

    $("#btnDescription").addEventListener("click", () => {
      $("#descriptionInput").value = state.description;
      openModal("descriptionModal");
    });
    $("#btnSaveDescription").addEventListener("click", () => {
      state.description = $("#descriptionInput").value;
      closeModal("descriptionModal");
      toast(window.SkyDiffI18n.t("descriptionSaved"));
    });

    document.querySelectorAll("[data-close-modal]").forEach((elm) => {
      elm.addEventListener("click", () => closeModal(elm.dataset.closeModal));
    });

    $("#btnOpenOriginal").addEventListener("click", () => openFileInto(originalEditor));
    $("#btnOpenModified").addEventListener("click", () => openFileInto(modifiedEditor));
    $("#btnCompare").addEventListener("click", () => runCompare({ manual: true }));

    $("#btnSwapSides").addEventListener("click", () => {
      const { original, modified } = getEditorValues();
      setEditorValues(modified, original);
      if (state.compared) runCompare({ manual: true });
    });

    $("#btnCopyOriginal").addEventListener("click", async () => {
      await window.skydiff.writeClipboard(getEditorValues().original);
      toast(window.SkyDiffI18n.t("originalCopied"));
    });
    $("#btnCopyModified").addEventListener("click", async () => {
      await window.skydiff.writeClipboard(getEditorValues().modified);
      toast(window.SkyDiffI18n.t("modifiedCopied"));
    });

    $("#btnFirstChange").addEventListener("click", () => {
      window.SkyDiffView.goToFirstChange($("#diffContainer"));
    });

    // 표시 섹션
    document.querySelectorAll("#layoutToggle .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.settings.layout = btn.dataset.value;
        document.querySelectorAll("#layoutToggle .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
        persistSettings();
        if (state.compared) renderDiff();
      });
    });

    $("#liveEditToggle").addEventListener("change", (e) => {
      state.settings.liveEdit = e.target.checked;
      persistSettings();
    });

    $("#ignoreWhitespaceToggle").addEventListener("change", (e) => {
      state.settings.ignoreWhitespace = e.target.checked;
      onProcessingOptionChanged();
    });
    $("#hideUnchangedToggle").addEventListener("change", (e) => {
      state.settings.hideUnchanged = e.target.checked;
      onProcessingOptionChanged();
    });
    $("#wordWrapToggle").addEventListener("change", (e) => {
      // 체크됨 = 줄바꿈 비활성화
      state.settings.wordWrap = !e.target.checked;
      persistSettings();
      $("#diffContainer").classList.toggle("nowrap", !state.settings.wordWrap);
      const wrapOpt = state.settings.wordWrap ? "on" : "off";
      originalEditor.updateOptions({ wordWrap: wrapOpt });
      modifiedEditor.updateOptions({ wordWrap: wrapOpt });
    });

    $("#granularitySelect").addEventListener("change", (e) => {
      state.settings.granularity = e.target.value;
      onProcessingOptionChanged();
    });
    $("#syntaxSelect").addEventListener("change", (e) => {
      state.settings.syntax = e.target.value;
      persistSettings();
      setLanguage(e.target.value);
    });

    // 모양 변경
    $("#btnAppearance").addEventListener("click", () => toggleExpand("btnAppearance", "appearancePanel"));
    $("#colorAdded").addEventListener("input", (e) => {
      state.settings.colors.added = e.target.value;
      window.SkyDiffView.applyColors(state.settings.colors.added, state.settings.colors.addedBg, state.settings.colors.removed, state.settings.colors.removedBg);
      persistSettings();
    });
    $("#colorRemoved").addEventListener("input", (e) => {
      state.settings.colors.removed = e.target.value;
      window.SkyDiffView.applyColors(state.settings.colors.added, state.settings.colors.addedBg, state.settings.colors.removed, state.settings.colors.removedBg);
      persistSettings();
    });
    $("#btnResetColors").addEventListener("click", () => {
      state.settings.colors = { added: "#16a34a", removed: "#dc2626", addedBg: "#dcfce7", removedBg: "#fee2e2" };
      $("#colorAdded").value = state.settings.colors.added;
      $("#colorRemoved").value = state.settings.colors.removed;
      window.SkyDiffView.applyColors(state.settings.colors.added, state.settings.colors.addedBg, state.settings.colors.removed, state.settings.colors.removedBg);
      persistSettings();
    });

    // 처리
    $("#btnExclude").addEventListener("click", () => toggleExpand("btnExclude", "excludePanel"));
    $("#btnAddExclude").addEventListener("click", () => {
      state.settings.excludePatterns.push({ pattern: "", isRegex: false, enabled: true });
      renderExcludeList();
      persistSettings();
    });
    $("#btnTransform").addEventListener("click", () => toggleExpand("btnTransform", "transformPanel"));

    $("#tfTrim").addEventListener("change", (e) => {
      state.settings.textTransforms.trimLines = e.target.checked;
      onProcessingOptionChanged();
    });
    $("#tfIgnoreCase").addEventListener("change", (e) => {
      state.settings.textTransforms.ignoreCase = e.target.checked;
      onProcessingOptionChanged();
    });
    $("#tfRemoveEmpty").addEventListener("change", (e) => {
      state.settings.textTransforms.removeEmptyLines = e.target.checked;
      onProcessingOptionChanged();
    });
    $("#tfSort").addEventListener("change", (e) => {
      state.settings.textTransforms.sortLines = e.target.checked;
      onProcessingOptionChanged();
    });

    $("#btnAboutGithub").addEventListener("click", () => {
      window.skydiff.writeClipboard("https://github.com/3rdappsmod/SkyDiff");
      toast(window.SkyDiffI18n.t("githubUrlCopied"));
    });

    wireDragAndDrop($("#originalEditor"), { setValue: (v) => originalEditor.setValue(v) });
    wireDragAndDrop($("#modifiedEditor"), { setValue: (v) => modifiedEditor.setValue(v) });

    window.skydiff.onMenuAction(handleMenuAction);
    window.skydiff.onUpdateStatus((payload) => {
      if (payload.type === "available" || payload.type === "downloaded" || payload.type === "error") {
        toast(payload.message);
      }
    });
  }

  function toggleExpand(btnId, panelId) {
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    const open = panel.classList.toggle("hidden") === false;
    btn.classList.toggle("open", open);
  }

  async function handleMenuAction(action) {
    switch (action) {
      case "new":
        resetAll();
        break;
      case "open-original":
        openFileInto(originalEditor);
        break;
      case "open-modified":
        openFileInto(modifiedEditor);
        break;
      case "export":
        exportDiff();
        break;
      case "save":
        saveCurrentComparison();
        break;
      case "reset":
        resetAll();
        break;
      case "layout-side-by-side":
        state.settings.layout = "side-by-side";
        applySettingsToUI();
        persistSettings();
        if (state.compared) renderDiff();
        break;
      case "layout-unified":
        state.settings.layout = "unified";
        applySettingsToUI();
        persistSettings();
        if (state.compared) renderDiff();
        break;
      case "about": {
        const version = await window.skydiff.getAppVersion();
        $("#aboutVersion").textContent = version;
        openModal("aboutModal");
        break;
      }
    }
  }

  // ---------------- 초기화 ----------------

  async function boot() {
    const [settings, locale] = await Promise.all([window.skydiff.getSettings(), window.skydiff.getLocale()]);
    state.settings = settings;

    window.SkyDiffI18n.init(locale);
    state.title = $("#titleInput").value;

    await new Promise((resolve) => {
      window.require.config({ paths: { vs: "../../vendor/monaco/vs" } });
      window.require(["vs/editor/editor.main"], () => resolve());
    });

    createEditors(window.monaco);
    applySettingsToUI();
    setLanguage(state.settings.syntax);
    wireEvents();
    refreshSavedList();
    updateStats({ added: 0, removed: 0 });
    showDiffPlaceholder(window.SkyDiffI18n.t("emptyStatePlaceholder"));
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
