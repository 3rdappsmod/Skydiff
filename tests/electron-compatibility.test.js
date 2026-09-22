"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clipboardHandler(writeText) {
  const handlers = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8"), {
    __dirname: path.join(__dirname, "../src/main"), process,
    require(name) {
      if (name === "electron") return {
        app: { whenReady: () => ({ then() {} }), on() {} },
        ipcMain: { handle: (key, fn) => { handlers[key] = fn; } },
        clipboard: { writeText }
      };
      if (name === "./store") return {};
      if (name === "./menu") return { buildMenu() {} };
      if (name === "./updater") return { setupAutoUpdater() {} };
      if (name === "./i18n") return require("../src/main/i18n");
      return require(name);
    }
  });
  return handlers["clipboard:write-text"];
}

test("clipboard IPC waits for Electron 44's asynchronous write", async () => {
  let finish;
  let written;
  const handler = clipboardHandler((text) => {
    written = text;
    return new Promise((resolve) => { finish = resolve; });
  });
  let completed = false;
  const result = handler({}, "한글 clipboard").then((value) => { completed = true; return value; });
  await Promise.resolve();
  assert.equal(written, "한글 clipboard");
  assert.equal(completed, false);
  finish();
  assert.equal(await result, true);
});

test("clipboard IPC propagates asynchronous write failures", async () => {
  const handler = clipboardHandler(async () => { throw new Error("Clipboard unavailable"); });
  await assert.rejects(handler({}, "text"), /Clipboard unavailable/);
});
