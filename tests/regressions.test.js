"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const Diff = require("diff");
const root = path.join(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function element() {
  const classes = new Set();
  const listeners = new Map();
  let content = "";
  return {
    children: [], style: {}, dataset: {}, value: "", checked: false,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, force = !classes.has(name)) {
        if (force) classes.add(name); else classes.delete(name);
        return force;
      }
    },
    get textContent() { return content; },
    set textContent(value) { content = value; this.children = []; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    async fire(name, event = {}) {
      if (listeners.has(name)) await listeners.get(name)({ target: this, ...event });
    }
  };
}

async function createApp() {
  let data;
  vm.runInNewContext(source("src/main/store.js"), {
    module: {}, require: () => class { constructor(options) { data = options.defaults; } }
  });
  data = JSON.parse(JSON.stringify(data));
  const handlers = {};
  const electron = {
    app: { whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }
  };
  vm.runInNewContext(source("src/main/main.js"), {
    __dirname: path.join(root, "src/main"), process,
    require(name) {
      if (name === "electron") return electron;
      if (name === "./store") return { get: (key) => data[key], set: (key, value) => { data[key] = value; } };
      if (name === "./menu") return { buildMenu() {} };
      if (name === "./updater") return { setupAutoUpdater() {} };
      if (name === "./i18n") return require("../src/main/i18n");
      return require(name);
    }
  });
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  for (const match of source("src/renderer/index.html").matchAll(/id="([^"]+)"[^>]*class="([^"]+)"/g)) {
    get(match[1]).classList.add(...match[2].split(" "));
  }
  let boot;
  const document = {
    querySelector: (selector) => get(selector.slice(1)),
    querySelectorAll: () => [], getElementById: get,
    createElement: element, createTextNode: (text) => ({ textContent: text }),
    body: element(), documentElement: element(),
    addEventListener: (_name, fn) => { boot = fn; }
  };
  const editors = [];
  let renderedRows = [];
  const timers = new Map();
  let timerId = 0;
  const api = {
    getSettings: async () => data.settings, getLocale: async () => "en",
    setSettings: async (settings) => { data.settings = settings; },
    getComparisons: async () => data.comparisons,
    saveComparison: async (entry) => handlers["store:save-comparison"]({}, JSON.parse(JSON.stringify(entry))),
    deleteComparison: async (id) => handlers["store:delete-comparison"]({}, id),
    onMenuAction() {}, onUpdateStatus() {},
    writeClipboard: async (text) => { api.clipboard = text; },
    saveTextFile: async (_name, text) => { api.exported = text; return { canceled: false }; }
  };
  const window = {
    crypto, Diff, skydiff: api,
    require: Object.assign((_modules, callback) => callback(), { config() {} }),
    monaco: { editor: {
      defineTheme() {}, setTheme() {}, setModelLanguage() {},
      create(_host, options) {
        let value = "";
        let onChange = () => {};
        const editor = {
          options: { ...options }, getValue: () => value, getModel: () => ({}),
          setValue(text) { value = text; onChange(); },
          updateOptions(next) { Object.assign(this.options, next); },
          onDidChangeModelContent(fn) { onChange = fn; }
        };
        editors.push(editor);
        return editor;
      }
    } },
    SkyDiffView: {
      applyColors() {},
      renderSideBySide(_container, rows) { renderedRows = rows; },
      renderUnified(_container, rows) { renderedRows = rows; }
    }
  };
  const context = vm.createContext({
    window, document,
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id)
  });
  for (const file of ["i18n", "diffEngine", "app"]) {
    vm.runInContext(source(`src/renderer/js/${file}.js`), context);
  }
  await boot();
  return {
    get, editors, api, data, engine: window.SkyDiffEngine,
    rows: () => renderedRows,
    input(a, b) { editors[0].setValue(a); editors[1].setValue(b); },
    async click(id) { await get(id).fire("click"); },
    async toggle(id, checked) { get(id).checked = checked; await get(id).fire("change"); },
    flushEditing() {
      for (const [id, timer] of timers) {
        if (timer.delay === 350) { timers.delete(id); timer.fn(); }
      }
    }
  };
}

test("initial typing waits for Compare; whitespace-only edits are valid", async () => {
  const app = await createApp();
  app.input(" ", "  ");
  app.flushEditing();
  assert.equal(app.rows().length, 0);
  await app.click("btnCompare");
  assert.equal(app.get("statAddedCount").textContent, "1 addition(s)");
  assert.equal(app.rows()[0].original.type, "removed");
  await app.click("btnSave");
  assert.equal(app.data.comparisons.length, 1);
});

test("clearing both editors clears results and live comparison resumes", async () => {
  const app = await createApp();
  app.input("old", "new");
  await app.click("btnCompare");
  app.input("", "");
  app.flushEditing();
  assert.equal(app.get("statAddedCount").textContent, "0 addition(s)");
  assert.equal(app.get("diffContainer").children.length, 1);
  assert.equal(app.get("warningBanner").classList.contains("hidden"), true);
  app.input("same", "same");
  app.flushEditing();
  assert.equal(app.get("warningBanner").textContent, "The two texts are identical.");
});

test("concurrent and repeated saves update one comparison, reset starts a new one", async () => {
  const app = await createApp();
  app.input("a", "b");
  await Promise.all([app.click("btnSave"), app.click("btnSave")]);
  assert.equal(app.data.comparisons.length, 1);
  app.input("a", "c");
  await app.click("btnSave");
  assert.equal(app.data.comparisons.length, 1);
  assert.equal(app.data.comparisons[0].modified, "c");
  await app.click("btnReset");
  app.input("a", "d");
  await app.click("btnSave");
  assert.equal(app.data.comparisons.length, 2);
});

test("wrap toggle and editors restore together when loading saved comparisons", async () => {
  const app = await createApp();
  assert.equal(app.get("wordWrapToggle").checked, false);
  assert.equal(app.editors[0].options.wordWrap, "on");
  await app.toggle("wordWrapToggle", true);
  app.input("a", "b");
  await app.click("btnSave");
  await app.toggle("wordWrapToggle", false);
  await app.get("savedList").children[0].fire("click");
  assert.equal(app.get("wordWrapToggle").checked, true);
  for (const editor of app.editors) assert.equal(editor.options.wordWrap, "off");
});

test("copy and save feedback is visible", async () => {
  const app = await createApp();
  app.input("a", "b");
  await app.click("btnCopyOriginal");
  assert.equal(app.api.clipboard, "a");
  assert.equal(app.get("toast").classList.contains("hidden"), false);
  assert.equal(app.get("toast").classList.contains("show"), true);
});

test("export and share use current inputs and processing options", async () => {
  const app = await createApp();
  app.input("ABC", "abc");
  await app.toggle("tfIgnoreCase", true);
  await app.click("btnCompare");
  await app.click("btnShare");
  assert.match(app.api.clipboard, /0 deletion\(s\), 0 addition\(s\)/);
  assert.equal(Diff.parsePatch(app.api.clipboard.slice(app.api.clipboard.indexOf("====")))[0].hunks.length, 0);
  await app.toggle("liveEditToggle", false);
  app.input("ABC", "XYZ");
  await app.click("btnShare");
  assert.match(app.api.clipboard, /1 deletion\(s\), 1 addition\(s\)/);
  assert.match(app.api.clipboard, /-abc\n/);
  assert.match(app.api.clipboard, /\+xyz\n/);
  await app.click("btnExport");
  assert.equal(Diff.applyPatch("abc", app.api.exported), "xyz");
});

test("leading/trailing whitespace is ignored consistently in results and exported patches", async () => {
  const app = await createApp();
  app.input(" a \n", "a\n");
  await app.toggle("ignoreWhitespaceToggle", true);
  await app.click("btnExport");
  assert.equal(app.get("statAddedCount").textContent, "0 addition(s)");
  assert.equal(Diff.parsePatch(app.api.exported)[0].hunks.length, 0);
  app.input("a b", "a  b");
  await app.click("btnCompare");
  assert.equal(app.get("statAddedCount").textContent, "1 addition(s)");
});

test("re-enabling live edits refreshes a previously compared document", async () => {
  const app = await createApp();
  app.input("same", "same");
  await app.click("btnCompare");
  await app.toggle("liveEditToggle", false);
  app.input("old", "new");
  app.flushEditing();
  await app.toggle("liveEditToggle", true);
  assert.equal(app.get("statAddedCount").textContent, "1 addition(s)");
});

test("Korean character differences and end-of-file newlines remain detectable", async () => {
  const { engine } = await createApp();
  const korean = engine.compute("가나다", "가마바", { granularity: "char" });
  assert.equal(korean.identical, false);
  assert.equal(korean.rows[0].modified.tokens.filter((token) => token.kind === "added").map((token) => token.text).join(""), "마바");
  assert.equal(engine.compute("a", "a\n", {}).identical, false);
});


test("excluded lines and transformations are reflected in exported patches", async () => {
  const app = await createApp();
  app.data.settings.excludePatterns = [{ enabled: true, pattern: "timestamp:", isRegex: false }];
  app.data.settings.textTransforms = { trimLines: true, removeEmptyLines: true, ignoreCase: true, sortLines: true };
  app.input("timestamp: old\n B \n\nA", "timestamp: new\na\nC");
  await app.click("btnExport");
  assert.equal(Diff.applyPatch("a\nb", app.api.exported), "a\nc");
  assert.doesNotMatch(app.api.exported, /timestamp:/);
});
