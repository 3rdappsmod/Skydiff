"use strict";

/**
 * diffEngine.js 가 만든 rows 구조를 실제 DOM으로 그린다.
 * 텍스트는 항상 textContent 로만 넣어 사용자가 붙여넣은 내용이 HTML로 해석되지 않게 한다.
 */
(function (global) {
  function el(tag, className) {
    const e = document.createElement("div");
    e.className = className || "";
    return e;
  }

  function appendTokens(container, tokens, highlightClassMap) {
    for (const token of tokens) {
      if (token.kind === "plain") {
        container.appendChild(document.createTextNode(token.text));
      } else {
        const span = document.createElement("span");
        span.className = highlightClassMap[token.kind] || "";
        span.textContent = token.text;
        container.appendChild(span);
      }
    }
  }

  function buildHalf(sideData, sideClass) {
    const half = el("div", "diff-half " + sideClass + " type-" + (sideData ? sideData.type : "empty"));
    if (!sideData || sideData.type === "empty") return half;

    const lineNum = el("div", "diff-line-num");
    lineNum.textContent = String(sideData.lineNum);

    const content = el("div", "diff-line-content");
    const highlightMap = sideData.type === "removed" ? { removed: "diff-token-removed" } : { added: "diff-token-added" };
    appendTokens(content, sideData.tokens, highlightMap);

    half.appendChild(lineNum);
    half.appendChild(content);
    return half;
  }

  function buildPlaceholderRow(row, onExpand) {
    const wrap = el("div", "diff-placeholder-row");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "diff-placeholder-btn";
    btn.textContent = "⋯ 변경 없는 " + row.count + "줄 표시 ⋯";
    btn.addEventListener("click", () => onExpand(row));
    wrap.appendChild(btn);
    return wrap;
  }

  function renderSideBySide(container, rows, onExpandPlaceholder) {
    container.textContent = "";
    container.classList.remove("diff-unified");
    container.classList.add("diff-side-by-side");

    for (const row of rows) {
      if (row.type === "placeholder") {
        container.appendChild(buildPlaceholderRow(row, onExpandPlaceholder));
        continue;
      }
      const rowType = row.original.type === "unchanged" ? "unchanged" : row.original.type === "removed" || row.modified.type === "added" ? "changed" : "unchanged";
      const rowEl = el("div", "diff-row type-" + rowType);
      rowEl.appendChild(buildHalf(row.original, "diff-half-left"));
      rowEl.appendChild(buildHalf(row.modified, "diff-half-right"));
      if (row.original.type !== "unchanged" || row.modified.type !== "unchanged") {
        rowEl.dataset.change = "1";
      }
      container.appendChild(rowEl);
    }
  }

  function buildUnifiedLine(sideData, marker, type) {
    const row = el("div", "diff-row type-" + type);
    const markerEl = el("div", "diff-marker");
    markerEl.textContent = marker;

    const lineNum = el("div", "diff-line-num");
    lineNum.textContent = String(sideData.lineNum);

    const content = el("div", "diff-line-content");
    const highlightMap = type === "removed" ? { removed: "diff-token-removed" } : type === "added" ? { added: "diff-token-added" } : {};
    appendTokens(content, sideData.tokens, highlightMap);

    row.appendChild(markerEl);
    row.appendChild(lineNum);
    row.appendChild(content);
    return row;
  }

  function renderUnified(container, rows, onExpandPlaceholder) {
    container.textContent = "";
    container.classList.remove("diff-side-by-side");
    container.classList.add("diff-unified");

    for (const row of rows) {
      if (row.type === "placeholder") {
        container.appendChild(buildPlaceholderRow(row, onExpandPlaceholder));
        continue;
      }

      if (row.original.type === "unchanged" && row.modified.type === "unchanged") {
        const rowEl = buildUnifiedLine(row.original, " ", "unchanged");
        container.appendChild(rowEl);
        continue;
      }

      if (row.original.type === "removed") {
        const rowEl = buildUnifiedLine(row.original, "-", "removed");
        rowEl.dataset.change = "1";
        container.appendChild(rowEl);
      }
      if (row.modified.type === "added") {
        const rowEl = buildUnifiedLine(row.modified, "+", "added");
        rowEl.dataset.change = "1";
        container.appendChild(rowEl);
      }
    }
  }

  /** placeholder row를 펼쳐서 본래 rows를 그 자리에 다시 그려 넣는다 (재렌더링). */
  function expandPlaceholderInRows(rows, placeholderRow) {
    const idx = rows.indexOf(placeholderRow);
    if (idx === -1) return rows;
    const next = rows.slice();
    next.splice(idx, 1, ...placeholderRow.rows);
    return next;
  }

  function goToFirstChange(container) {
    const first = container.querySelector('[data-change="1"]');
    if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function applyColors(added, addedBg, removed, removedBg) {
    const root = document.documentElement;
    root.style.setProperty("--color-added", added);
    root.style.setProperty("--color-added-bg", addedBg);
    root.style.setProperty("--color-removed", removed);
    root.style.setProperty("--color-removed-bg", removedBg);
  }

  global.SkyDiffView = { renderSideBySide, renderUnified, expandPlaceholderInRows, goToFirstChange, applyColors };
})(window);
