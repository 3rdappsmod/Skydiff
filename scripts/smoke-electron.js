"use strict";

// Exercise the actual Electron preload, Monaco renderer, IPC and local persistence.
// The isolated profile and stubbed file dialogs leave the user's data untouched.
const { app, dialog, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "skydiff-smoke-"));
app.setPath("userData", profile);
app.disableHardwareAcceleration();
const inputPath = path.join(profile, "input.txt");
const outputPath = path.join(profile, "comparison.diff");
fs.writeFileSync(inputPath, "가나다\n");
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [inputPath] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: outputPath });

const watchdog = setTimeout(() => {
  console.error("Electron smoke test timed out");
  app.exit(1);
}, 30000);

app.on("browser-window-created", (_event, window) => {
  window.hide();
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer exited:", details.reason);
    app.exit(1);
  });
  window.webContents.once("did-finish-load", async () => {
    try {
      const result = await window.webContents.executeJavaScript(`(async () => {
        const waitFor = async (predicate) => {
          for (let attempt = 0; attempt < 100; attempt++) {
            if (await predicate()) return;
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          throw new Error("Renderer state did not become ready");
        };
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        await waitFor(() => window.monaco && monaco.editor.getModels().length === 2);
        const [original, modified] = monaco.editor.getModels();
        const loaded = await window.skydiff.openTextFile();
        original.setValue(loaded.content);
        modified.setValue("가마바\\n");
        await new Promise(resolve => setTimeout(resolve, 400));
        check(!document.querySelector("[data-change]"), "Compared before the Compare button");
        document.getElementById("btnCompare").click();
        check(document.querySelector("[data-change]"), "Missing changed row");
        document.getElementById("btnSave").click();
        await waitFor(async () => (await window.skydiff.getComparisons()).length === 1);
        const saved = await window.skydiff.getComparisons();
        check(saved[0].original === "가나다\\n", "Saved text differs");
        document.getElementById("btnExport").click();
        original.setValue(" "); modified.setValue("  ");
        document.getElementById("btnCompare").click();
        check(document.querySelector("[data-change]"), "Whitespace comparison failed");
        original.setValue(""); modified.setValue("");
        document.getElementById("btnCompare").click();
        check(!document.querySelector("[data-change]"), "Stale result after clearing inputs");
        return { savedComparisons: saved.length };
      })()`);
      // Wait for the asynchronous save dialog and IPC write to complete.
      for (let attempt = 0; attempt < 100 && !fs.existsSync(outputPath); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const patch = fs.readFileSync(outputPath, "utf8");
      assert.match(patch, /-가나다/);
      assert.match(patch, /\+가마바/);
      console.log(JSON.stringify({ electron: process.versions.electron, ...result, fileExport: "passed" }));
      clearTimeout(watchdog);
      for (const win of BrowserWindow.getAllWindows()) win.destroy();
      app.exit(0);
    } catch (error) {
      console.error(error);
      clearTimeout(watchdog);
      app.exit(1);
    }
  });
});

const appRoot = process.env.SKYDIFF_SMOKE_APP || path.join(__dirname, "..");
require(path.join(appRoot, "src/main/main.js"));
