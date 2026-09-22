/* global importScripts */
"use strict";

importScripts("../../../vendor/diff/diff.min.js", "diffEngine.js", "textDecoder.js");

let result = null;
let options = {};
const PAGE_SIZE = 200;
const PREVIEW_CHARS = 2000;

function previewSide(side) {
  if (!side.tokens) return side;
  let remaining = PREVIEW_CHARS;
  const tokens = [];
  let truncated = false;
  for (const token of side.tokens) {
    if (token.text.length > remaining) truncated = true;
    if (remaining > 0) tokens.push({ ...token, text: token.text.slice(0, remaining) });
    remaining -= Math.min(remaining, token.text.length);
  }
  return { ...side, tokens, truncated };
}

function page(index = 0) {
  if (!result) throw new Error("runCompareFirst");
  const pages = Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE));
  index = Math.max(0, Math.min(pages - 1, Math.floor(index) || 0));
  const start = index * PAGE_SIZE;
  const rows = result.rows.slice(start, start + PAGE_SIZE).map((row, offset) => row.type === "placeholder"
    ? { type: row.type, count: row.count, index: start + offset }
    : { original: previewSide(row.original), modified: previewSide(row.modified) });
  return { rows, page: index, pages, totalRows: result.rows.length, stats: result.stats, identical: result.identical, detailLimited: result.detailLimited };
}

globalThis.onmessage = ({ data: { id, type, payload } }) => {
  try {
    let value;
    switch (type) {
      case "compare":
        result = null;
        options = payload.options;
        if (payload.original.length + payload.modified.length > 20000000) throw new Error("textTooLarge");
        result = globalThis.SkyDiffEngine.compute(payload.original, payload.modified, options);
        value = page();
        break;
      case "page": value = page(payload.index); break;
      case "expand": {
        const row = result && result.rows[payload.index];
        if (!row || row.type !== "placeholder") throw new Error("runCompareFirst");
        result.rows = result.rows.slice(0, payload.index).concat(row.rows, result.rows.slice(payload.index + 1));
        value = page(Math.floor(payload.index / PAGE_SIZE));
        break;
      }
      case "first": {
        if (!result) throw new Error("runCompareFirst");
        const index = result.rows.findIndex((row) => row.type !== "placeholder" &&
          (row.original.type === "removed" || row.modified.type === "added"));
        value = page(Math.floor(Math.max(0, index) / PAGE_SIZE));
        break;
      }
      case "patch":
        if (!result) throw new Error("runCompareFirst");
        value = globalThis.SkyDiffEngine.toUnifiedPatch(result.originalText, result.modifiedText,
          payload.originalName, payload.modifiedName, { ignoreWhitespace: !!options.ignoreWhitespace, timeout: 15000 });
        if (value === undefined) throw new Error("comparisonTimeout");
        break;
      case "decode": value = globalThis.SkyDiffDecoder.decode(payload.bytes, payload.encoding); break;
      default: throw new Error("operationFailed");
    }
    postMessage({ id, value });
  } catch (error) {
    postMessage({ id, error: error.message });
  }
};
