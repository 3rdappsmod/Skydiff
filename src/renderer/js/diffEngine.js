"use strict";

/**
 * 순수 diff 계산 로직 (DOM 접근 없음). jsdiff(window.Diff, vendor/diff/diff.min.js)를 사용한다.
 * 렌더링(diffView.js)이 그대로 쓸 수 있는 "rows" 구조로 결과를 만든다.
 */
(function (global) {
  const UNCHANGED_CONTEXT = 3; // '변경 없는 행 숨기기' 시 각 블록 앞뒤로 보여줄 줄 수

  function splitLines(text) {
    if (text === "") return [];
    return text.split("\n");
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function applyExclude(lines, excludePatterns) {
    const patterns = (excludePatterns || []).filter((rule) => rule.enabled && rule.pattern).map((rule) => {
      try { return new RegExp(rule.isRegex ? rule.pattern : escapeRegExp(rule.pattern)); }
      catch { return null; }
    }).filter(Boolean);
    return patterns.length ? lines.filter((line) => !patterns.some((re) => re.test(line))) : lines;
  }

  function applyTransforms(lines, transforms) {
    if (!transforms) return lines;
    let result = lines;
    if (transforms.trimLines) result = result.map((l) => l.trim());
    if (transforms.removeEmptyLines) result = result.filter((l) => l.trim() !== "");
    if (transforms.ignoreCase) result = result.map((l) => l.toLowerCase());
    if (transforms.sortLines) result = [...result].sort((a, b) => a.localeCompare(b));
    return result;
  }

  /** 원본/수정본 원문에 '처리' 옵션(제외, 텍스트 변환)을 적용해 실제 비교/표시에 쓸 텍스트를 만든다. */
  function preprocess(text, options) {
    let lines = splitLines(text);
    lines = applyExclude(lines, options.excludePatterns);
    lines = applyTransforms(lines, options.textTransforms);
    return lines.join("\n");
  }

  function subDiff(oldLine, newLine, options) {
    const { granularity, ignoreWhitespace } = options;
    if (granularity !== "line" && (oldLine.length + newLine.length > 4000 || Date.now() > options.inlineDeadline)) {
      options.detailLimited = true;
      return null;
    }
    const Diff = global.Diff;
    switch (granularity) {
      case "line":
        return null; // 줄 단위: 세부 하이라이트 없음
      case "word":
        return Diff.diffWords(oldLine, newLine, { ignoreWhitespace, timeout: 20 });
      case "char":
        return Diff.diffChars(oldLine, newLine, { timeout: 20 });
      case "smart":
      default: {
        // 단어 경계가 있는 일반 문장은 단어 단위로(가독성 우선), 공백 없이 이어진 문자열
        // (예: "hotdoghotdoghotdog" -> "hotdoghotdoghotsausage")은 단어 diff가 통째로
        // 1개 토큰 교체로만 보여 공통 부분을 못 찾으므로 문자 단위로 다시 계산해 공통 부분을 살린다.
        const wordDiff = Diff.diffWordsWithSpace(oldLine, newLine, { timeout: 20 });
        const hasCommonPart = wordDiff.some((part) => !part.added && !part.removed);
        if (hasCommonPart) return wordDiff;
        return Diff.diffChars(oldLine, newLine, { timeout: 20 });
      }
    }
  }

  function tokensFromSubDiff(parts, side) {
    // side: 'old' -> removed/공통만, 'new' -> added/공통만
    const tokens = [];
    for (const part of parts) {
      if (side === "old" && part.added) continue;
      if (side === "new" && part.removed) continue;
      const kind = part.added ? "added" : part.removed ? "removed" : "plain";
      tokens.push({ text: part.value, kind });
    }
    return tokens;
  }

  function plainTokens(text) {
    return [{ text, kind: "plain" }];
  }

  /**
   * jsdiff의 diffLines 결과(part 배열)를 원본/수정본 줄이 나란히 짝지어진 "행(row)" 배열로 변환한다.
   * row: { original: {type, lineNum, tokens} | null, modified: {type, lineNum, tokens} | null }
   */
  function buildRows(originalLines, modifiedLines, parts, options) {
    const rows = [];
    let oldIdx = 0;
    let newIdx = 0;
    let i = 0;

    while (i < parts.length) {
      const part = parts[i];

      if (!part.added && !part.removed) {
        const count = part.count;
        for (let k = 0; k < count; k++) {
          rows.push({
            original: { type: "unchanged", lineNum: oldIdx + 1, tokens: plainTokens(originalLines[oldIdx]) },
            modified: { type: "unchanged", lineNum: newIdx + 1, tokens: plainTokens(modifiedLines[newIdx]) }
          });
          oldIdx++;
          newIdx++;
        }
        i++;
        continue;
      }

      // removed 블록과 그 직후 added 블록을 하나의 "변경" 묶음으로 취급 (replace)
      let removedCount = 0;
      let addedCount = 0;
      if (part.removed) {
        removedCount = part.count;
        i++;
      }
      if (i < parts.length && parts[i].added) {
        addedCount = parts[i].count;
        i++;
      }

      const pairCount = Math.min(removedCount, addedCount);
      for (let k = 0; k < pairCount; k++) {
        const oldLine = originalLines[oldIdx + k];
        const newLine = modifiedLines[newIdx + k];
        const sub = subDiff(oldLine, newLine, options);
        if (!sub && options.granularity !== "line") options.detailLimited = true;
        rows.push({
          original: {
            type: "removed",
            lineNum: oldIdx + k + 1,
            tokens: sub ? tokensFromSubDiff(sub, "old") : plainTokens(oldLine)
          },
          modified: {
            type: "added",
            lineNum: newIdx + k + 1,
            tokens: sub ? tokensFromSubDiff(sub, "new") : plainTokens(newLine)
          }
        });
      }

      for (let k = pairCount; k < removedCount; k++) {
        rows.push({
          original: { type: "removed", lineNum: oldIdx + k + 1, tokens: plainTokens(originalLines[oldIdx + k]) },
          modified: { type: "empty" }
        });
      }
      for (let k = pairCount; k < addedCount; k++) {
        rows.push({
          original: { type: "empty" },
          modified: { type: "added", lineNum: newIdx + k + 1, tokens: plainTokens(modifiedLines[newIdx + k]) }
        });
      }

      oldIdx += removedCount;
      newIdx += addedCount;
    }

    return rows;
  }

  /** '변경 없는 행 숨기기' 옵션 적용: 긴 unchanged 구간을 접어 placeholder row로 대체한다. */
  function collapseUnchanged(rows, hideUnchanged) {
    if (!hideUnchanged) return rows;

    const result = [];
    let i = 0;
    while (i < rows.length) {
      if (rows[i].original.type === "unchanged" && rows[i].modified.type === "unchanged") {
        let j = i;
        while (j < rows.length && rows[j].original.type === "unchanged" && rows[j].modified.type === "unchanged") j++;
        const blockLen = j - i;
        if (blockLen <= UNCHANGED_CONTEXT * 2) {
          for (let k = i; k < j; k++) result.push(rows[k]);
        } else {
          for (let k = i; k < i + UNCHANGED_CONTEXT; k++) result.push(rows[k]);
          result.push({ type: "placeholder", count: blockLen - UNCHANGED_CONTEXT * 2, rows: rows.slice(i + UNCHANGED_CONTEXT, j - UNCHANGED_CONTEXT) });
          for (let k = j - UNCHANGED_CONTEXT; k < j; k++) result.push(rows[k]);
        }
        i = j;
      } else {
        result.push(rows[i]);
        i++;
      }
    }
    return result;
  }

  function computeStats(rows) {
    let added = 0;
    let removed = 0;
    for (const row of rows) {
      if (row.type === "placeholder") continue;
      if (row.original && row.original.type === "removed") removed++;
      if (row.modified && row.modified.type === "added") added++;
    }
    return { added, removed };
  }

  /**
   * 전체 비교 파이프라인: 전처리 -> 줄 단위 diff -> 짝짓기 -> 세부 하이라이트 -> 접기 -> 통계
   */
  function compute(originalTextRaw, modifiedTextRaw, options = {}) {
    options = { ...options, inlineDeadline: Date.now() + 1500, detailLimited: false };
    const originalText = preprocess(originalTextRaw, options);
    const modifiedText = preprocess(modifiedTextRaw, options);

    const originalLines = splitLines(originalText);
    const modifiedLines = splitLines(modifiedText);

    if (originalLines.length + modifiedLines.length > 500000) throw new Error("tooManyLines");

    const parts = global.Diff.diffLines(originalText, modifiedText, {
      ignoreWhitespace: !!options.ignoreWhitespace, timeout: 15000
    });

    if (!parts) throw new Error("comparisonTimeout");

    let rows = buildRows(originalLines, modifiedLines, parts, options);
    rows = collapseUnchanged(rows, options.hideUnchanged);

    const stats = computeStats(rows);
    const identical = stats.added === 0 && stats.removed === 0;

    return { rows, stats, identical, originalText, modifiedText, detailLimited: options.detailLimited };
  }

  function toUnifiedPatch(originalText, modifiedText, originalName, modifiedName, options = {}) {
    return global.Diff.createTwoFilesPatch(originalName || "Original", modifiedName || "Modified", originalText, modifiedText, "", "", options);
  }

  global.SkyDiffEngine = { compute, preprocess, toUnifiedPatch };
})(globalThis);
