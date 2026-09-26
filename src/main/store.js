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
      granularity: "smart", // 'smart' | 'word' | 'char'
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
    }
  }
});

// Keep large comparison bodies out of the frequently updated settings file.
const comparisons = new Store({ name: "skydiff-comparisons", defaults: { comparisons: [] } });
if (store.has("comparisons")) {
  const existing = comparisons.get("comparisons");
  const ids = new Set(existing.map((entry) => entry.id));
  const legacy = store.get("comparisons");
  // Write the destination first. Retrying an interrupted migration preserves newer entries.
  comparisons.set("comparisons", [...existing, ...legacy.filter((entry) => !ids.has(entry.id))]);
  store.delete("comparisons");
}

module.exports = {
  get(key) { return (key === "comparisons" ? comparisons : store).get(key); },
  set(key, value) { return (key === "comparisons" ? comparisons : store).set(key, value); }
};
