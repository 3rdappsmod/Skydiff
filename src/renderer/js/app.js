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
  const comparisonWorker = new window.SkyDiffWorkerClient();
  const fileLoads = new Map();
  const fileDecoders = new Map();
  let scheduleCompare = null;
  let revision = 0;
  let viewRequest = 0;

  // ---------------- 유틸 ----------------

  function $(sel) {
    return document.querySelector(sel);
  }

  function debounce(fn, wait) {
    let t = null;
    const scheduled = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
    scheduled.cancel = () => clearTimeout(t);
    return scheduled;
  }

  function toast(message) {
    const t = $("#toast");
    t.textContent = message;
    t.classList.remove("hidden");
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
    $("#wordWrapToggle").checked = !s.wordWrap;
    const editorOptions = { wordWrap: s.wordWrap ? "on" : "off" };
    if (originalEditor) originalEditor.updateOptions(editorOptions);
    if (modifiedEditor) modifiedEditor.updateOptions(editorOptions);
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
      return runCompare({ manual: false });
    }, 350);

    scheduleCompare = onChange;
    for (const editor of [originalEditor, modifiedEditor]) {
      editor.onDidChangeModelContent(() => {
        if (fileDecoders.has(editor)) fileDecoders.get(editor).cancel();
        fileLoads.set(editor, (fileLoads.get(editor) || 0) + 1);
        invalidateComparison();
        onChange();
      });
    }
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
    const onExpand = (placeholderRow) => changePage("expand", { index: placeholderRow.index });
    const result = state.lastDiffResult;
    $("#resultPager").classList.toggle("hidden", result.pages <= 1);
    $("#pageLabel").textContent = window.SkyDiffI18n.t("pageLabel", { n: result.page + 1, total: result.pages });
    $("#btnPrevPage").disabled = result.page === 0;
    $("#btnNextPage").disabled = result.page + 1 >= result.pages;
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

  function setBusy(busy) {
    $("#btnCancelCompare").classList.toggle("hidden", !busy);
    $("#compareStatus").textContent = busy ? window.SkyDiffI18n.t("comparing") : "";
    $("#diffContainer").setAttribute("aria-busy", String(busy));
  }

  function showOperationError(error) {
    if (error.message === "operationCanceled") return;
    const key = ["comparisonTimeout", "textTooLarge", "tooManyLines", "invalidEncoding", "fileTooLarge"].find((name) => error.message.includes(name));
    showWarning(window.SkyDiffI18n.t(key || "operationFailed"));
  }

  function cancelPendingWork() {
    if (scheduleCompare) scheduleCompare.cancel();
    revision++;
    viewRequest++;
    comparisonWorker.cancel();
  }

  // 텍스트가 바뀌어 지금 보이는 결과가 더 이상 유효하지 않을 때(=자동으로 다시
  // 비교하지 않을 때)만 쓴다. 처리 옵션 변경처럼 곧바로 재비교할 때 이걸 먼저
  // 부르면 새 결과가 나오기 전 잠깐 빈 화면/0으로 깜빡이므로 쓰지 않는다.
  function invalidateComparison() {
    cancelPendingWork();
    state.lastDiffResult = null;
    setBusy(false);
    hideWarning();
    $("#resultPager").classList.add("hidden");
    updateStats({ added: 0, removed: 0 });
    showDiffPlaceholder(window.SkyDiffI18n.t(state.compared ? "needsComparison" : "emptyStatePlaceholder"));
  }

  async function changePage(type, payload = {}) {
    if (!state.lastDiffResult) return;
    const currentRevision = revision;
    const request = ++viewRequest;
    try {
      const result = await comparisonWorker.request(type, payload);
      if (currentRevision !== revision || request !== viewRequest) return;
      state.lastDiffResult = result;
      renderDiff();
      $("#diffContainer").scrollTop = 0;
      if (type === "first") window.SkyDiffView.goToFirstChange($("#diffContainer"));
    } catch (error) {
      if (currentRevision === revision) showOperationError(error);
    }
  }

  async function runCompare({ manual } = {}) {
    cancelPendingWork();
    const currentRevision = revision;
    const { original, modified } = getEditorValues();
    if (original === "" && modified === "") {
      invalidateComparison();
      showDiffPlaceholder(window.SkyDiffI18n.t("emptyStatePlaceholder"));
      if (manual) showWarning(window.SkyDiffI18n.t("enterTextToCompare"));
      return null;
    }
    state.compared = true;
    hideWarning();
    setBusy(true);
    try {
      const result = await comparisonWorker.request("compare", { original, modified, options: buildOptionsFromSettings() });
      if (currentRevision !== revision) return null;
      state.lastDiffResult = result;
      renderDiff();
      updateStats(result.stats);
      if (result.identical) showWarning(window.SkyDiffI18n.t("textsIdentical"));
      if (result.detailLimited) $("#compareStatus").textContent = window.SkyDiffI18n.t("detailLimited");
      return result;
    } catch (error) {
      if (currentRevision === revision) showOperationError(error);
      return null;
    } finally {
      if (currentRevision === revision) {
        $("#btnCancelCompare").classList.add("hidden");
        $("#diffContainer").setAttribute("aria-busy", "false");
        if (!state.lastDiffResult || !state.lastDiffResult.detailLimited) $("#compareStatus").textContent = "";
      }
    }
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

  function selectedEncoding(editor) {
    return $(editor === originalEditor ? "#originalEncoding" : "#modifiedEncoding").value || "auto";
  }

  async function importBytes(editor, bytes, version, encoding) {
    if (fileLoads.get(editor) !== version) return;
    if (fileDecoders.has(editor)) fileDecoders.get(editor).cancel();
    const decoder = new window.SkyDiffWorkerClient();
    fileDecoders.set(editor, decoder);
    try {
      const buffer = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).buffer;
      const decoded = await decoder.request("decode", { bytes: buffer, encoding }, [buffer]);
      if (fileLoads.get(editor) !== version) return;
      editor.setValue(decoded.text);
      toast(window.SkyDiffI18n.t("fileEncodingLoaded", { encoding: decoded.encoding }));
    } catch (error) {
      if (fileLoads.get(editor) === version) showOperationError(error);
    } finally {
      decoder.cancel();
      if (fileDecoders.get(editor) === decoder) fileDecoders.delete(editor);
    }
  }

  async function openFileInto(targetEditor) {
    const version = (fileLoads.get(targetEditor) || 0) + 1;
    fileLoads.set(targetEditor, version);
    const encoding = selectedEncoding(targetEditor);
    try {
      const result = await window.skydiff.openTextFile();
      if (!result.canceled && fileLoads.get(targetEditor) === version) {
        await importBytes(targetEditor, result.bytes, version, encoding);
      }
    } catch (error) { showOperationError(error); }
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
      const version = (fileLoads.get(targetEditor) || 0) + 1;
      fileLoads.set(targetEditor, version);
      const encoding = selectedEncoding(targetEditor);
      try {
        if (file.size > 50 * 1024 * 1024) throw new Error("fileTooLarge");
        await importBytes(targetEditor, await file.arrayBuffer(), version, encoding);
      } catch (error) { showOperationError(error); }
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
        return onProcessingOptionChanged();
      });

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = window.SkyDiffI18n.t("patternPlaceholder");
      input.value = rule.pattern || "";
      input.addEventListener("input", () => {
        state.settings.excludePatterns[idx].pattern = input.value;
        return onProcessingOptionChanged();
      });

      const regexLabel = document.createElement("label");
      const regexCb = document.createElement("input");
      regexCb.type = "checkbox";
      regexCb.checked = !!rule.isRegex;
      regexCb.addEventListener("change", () => {
        state.settings.excludePatterns[idx].isRegex = regexCb.checked;
        return onProcessingOptionChanged();
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
        return onProcessingOptionChanged();
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
    if (state.compared) return runCompare({ manual: false });
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

  async function loadComparison(item) {
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
    await runCompare({ manual: true });
  }

  async function saveCurrentComparison() {
    const { original, modified } = getEditorValues();
    if (original === "" && modified === "") {
      toast(window.SkyDiffI18n.t("nothingToSave"));
      return;
    }
    // Reserve the ID before IPC so repeated saves update the same comparison.
    if (!state.currentComparisonId) state.currentComparisonId = window.crypto.randomUUID();
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

  async function preparePatch() {
    const result = await runCompare({ manual: true });
    if (!result) return null;
    const currentRevision = revision;
    setBusy(true);
    try {
      const patch = await comparisonWorker.request("patch", {
        originalName: window.SkyDiffI18n.t("original"), modifiedName: window.SkyDiffI18n.t("modified")
      });
      return currentRevision === revision ? { patch, stats: result.stats, title: state.title } : null;
    } catch (error) {
      if (currentRevision === revision) showOperationError(error);
      return null;
    } finally {
      if (currentRevision === revision) setBusy(false);
    }
  }

  async function exportDiff() {
    const prepared = await preparePatch();
    if (!prepared) return;
    try {
      const result = await window.skydiff.saveTextFile((prepared.title || "diff") + ".diff", prepared.patch);
      if (!result.canceled) toast(window.SkyDiffI18n.t("exportComplete"));
    } catch (error) { showOperationError(error); }
  }

  async function shareDiff() {
    const prepared = await preparePatch();
    if (!prepared) return;
    const { stats, patch, title } = prepared;
    const statsLine = `(${window.SkyDiffI18n.t("deletedCount", { n: stats.removed })}, ${window.SkyDiffI18n.t("addedCount", { n: stats.added })})`;
    try {
      await window.skydiff.writeClipboard(`${title} ${statsLine}\n\n${patch}`);
      toast(window.SkyDiffI18n.t("copiedToClipboard"));
    } catch (error) { showOperationError(error); }
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

    $("#btnFirstChange").addEventListener("click", () => changePage("first"));
    $("#btnPrevPage").addEventListener("click", () => changePage("page", { index: state.lastDiffResult.page - 1 }));
    $("#btnNextPage").addEventListener("click", () => changePage("page", { index: state.lastDiffResult.page + 1 }));
    $("#btnCancelCompare").addEventListener("click", () => {
      invalidateComparison();
      showDiffPlaceholder(window.SkyDiffI18n.t("operationCanceled"));
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
      if (state.compared && state.settings.liveEdit) return runCompare({ manual: false });
    });

    $("#ignoreWhitespaceToggle").addEventListener("change", (e) => {
      state.settings.ignoreWhitespace = e.target.checked;
      return onProcessingOptionChanged();
    });
    $("#hideUnchangedToggle").addEventListener("change", (e) => {
      state.settings.hideUnchanged = e.target.checked;
      return onProcessingOptionChanged();
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
      return onProcessingOptionChanged();
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
      return onProcessingOptionChanged();
    });
    $("#tfIgnoreCase").addEventListener("change", (e) => {
      state.settings.textTransforms.ignoreCase = e.target.checked;
      return onProcessingOptionChanged();
    });
    $("#tfRemoveEmpty").addEventListener("change", (e) => {
      state.settings.textTransforms.removeEmptyLines = e.target.checked;
      return onProcessingOptionChanged();
    });
    $("#tfSort").addEventListener("change", (e) => {
      state.settings.textTransforms.sortLines = e.target.checked;
      return onProcessingOptionChanged();
    });

    $("#btnAboutGithub").addEventListener("click", () => {
      window.skydiff.writeClipboard("https://github.com/3rdappsmod/SkyDiff");
      toast(window.SkyDiffI18n.t("githubUrlCopied"));
    });

    wireDragAndDrop($("#originalEditor"), originalEditor);
    wireDragAndDrop($("#modifiedEditor"), modifiedEditor);

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
