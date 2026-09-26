"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const source = (file) => fs.readFileSync(path.join(__dirname, "../src/main", file), "utf8");

function loadStores(files, failWrite = false) {
  const writes = [];
  class Store {
    constructor({ name, defaults }) {
      this.name = name;
      files[name] = { ...defaults, ...files[name] };
    }
    get(key) { return files[this.name][key]; }
    has(key) { return key in files[this.name]; }
    set(key, value) {
      if (failWrite && this.name === "skydiff-comparisons") throw new Error("disk full");
      writes.push(this.name);
      files[this.name][key] = value;
    }
    delete(key) { delete files[this.name][key]; }
  }
  const context = { module: {}, require: () => ({ default: Store }) };
  vm.runInNewContext(source("store.js"), context);
  return { store: context.module.exports, writes };
}

test("legacy comparisons migrate intact and settings writes exclude comparison bodies", () => {
  const entry = { id: "one", original: "한글", modified: "text", settings: { granularity: "char" } };
  const files = { "skydiff-data": { comparisons: [entry], settings: { darkMode: true } } };
  const { store, writes } = loadStores(files);
  assert.equal(store.get("comparisons")[0], entry);
  assert.equal(store.get("settings").darkMode, true);
  assert.equal("comparisons" in files["skydiff-data"], false);
  writes.length = 0;
  store.set("windowBounds", { x: 1 });
  store.set("settings", { darkMode: false });
  assert.deepEqual(writes, ["skydiff-data", "skydiff-data"]);
  assert.equal(store.get("comparisons")[0], entry);
  const reopened = loadStores(files);
  assert.equal(reopened.store.get("comparisons")[0], entry);
  assert.equal(reopened.writes.length, 0);
});

test("failed migration keeps legacy data and retries without overwriting newer entries", () => {
  const old = { id: "same", original: "old" };
  const current = { id: "same", original: "new" };
  const extra = { id: "extra", original: "preserve" };
  const files = { "skydiff-data": { comparisons: [old, extra] }, "skydiff-comparisons": { comparisons: [current] } };
  assert.throws(() => loadStores(files, true), /disk full/);
  assert.deepEqual(files["skydiff-data"].comparisons, [old, extra]);
  const { store } = loadStores(files);
  assert.deepEqual(Array.from(store.get("comparisons")), [current, extra]);
  assert.equal("comparisons" in files["skydiff-data"], false);
  loadStores(files);
  assert.equal(store.get("comparisons").length, 2);
});

test("window movements are debounced and the latest bounds flush on close", () => {
  const timers = new Map();
  let next = 0;
  const context = {
    module: {},
    setTimeout(fn) { timers.set(++next, fn); return next; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(source("window-state.js"), context);
  const win = new EventEmitter();
  let x = 0;
  win.getBounds = () => ({ x, y: 0, width: 1000, height: 800 });
  win.isMaximized = () => false;
  win.isDestroyed = () => false;
  const writes = [];
  context.module.exports.trackWindowBounds(win, { set: (_key, value) => writes.push(value) });
  for (x = 1; x <= 10; x++) { win.emit("move"); win.emit("resize"); }
  assert.equal(writes.length, 0);
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].x, x);
  x = 20;
  win.emit("move");
  win.emit("close");
  assert.equal(writes.length, 2);
  assert.equal(writes[1].x, 20);
  assert.equal(timers.size, 0);
  win.emit("move");
  win.emit("closed");
  assert.equal(timers.size, 0);
});
