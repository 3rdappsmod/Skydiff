"use strict";

const { default: Store } = require("electron-store");

const store = new Store({
  name: "skydiff-data",
  defaults: {
    windowBounds: { width: 1280, height: 860, x: undefined, y: undefined, maximized: false },
    settings: {
      darkMode: false,
      layout: "side-by-side", // 'side-by-side' | 'unified'
      liveEdit: true,
      ignoreWhitespace: false,
      hideUnchanged: false,
      wordWrap: true,
      granularity: "smart", // 'smart' | 'line' | 'word' | 'char'
      syntax: "plaintext",
      excludePatterns: [], // [{ pattern: string, isRegex: boolean, enabled: boolean }]
      textTransforms: {
        trimLines: false,
        ignoreCase: false,
        removeEmptyLines: false,
        sortLines: false
      },
      colors: {
        added: "#16a34a",
        removed: "#dc2626",
        addedBg: "#dcfce7",
        removedBg: "#fee2e2"
      }
    },
    comparisons: [] // [{ id, title, description, createdAt, original, modified, settings }]
  }
});

module.exports = store;
