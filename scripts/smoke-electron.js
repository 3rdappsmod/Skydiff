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
const cp949Path = path.join(profile, "cp949.txt");
const lePath = path.join(profile, "utf16le.txt");
const bePath = path.join(profile, "utf16be.txt");
const manualPath = path.join(profile, "utf16be-no-bom.txt");
fs.writeFileSync(cp949Path, Buffer.from("b0a1b3aab4d90a", "hex"));
fs.writeFileSync(lePath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("가나다\n", "utf16le")]));
fs.writeFileSync(bePath, Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from("가나다\n", "utf16le").swap16()]));
fs.writeFileSync(manualPath, Buffer.from("가나다\n", "utf16le").swap16());
const inputPaths = [inputPath, cp949Path, lePath, bePath, manualPath];
let inputIndex = 0;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [inputPaths[inputIndex++]] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: outputPath });

const watchdog = setTimeout(() => {
  console.error("Electron smoke test timed out");
  app.exit(1);
}, 90000);

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
          for (let attempt = 0; attempt < 400; attempt++) {
            if (await predicate()) return;
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          throw new Error("Renderer state did not become ready");
        };
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        await waitFor(() => window.monaco && monaco.editor.getModels().length === 2);
        const [original, modified] = monaco.editor.getModels();
        const decoder = new window.SkyDiffWorkerClient();
        const uhc = await decoder.request("decode", { bytes: new Uint8Array([0x81, 0x41]).buffer, encoding: "cp949" });
        check(uhc.text === "갂", "CP949 extension decoding failed");
        decoder.cancel();
        document.getElementById("btnOpenOriginal").click();
        await waitFor(() => original.getValue() === "가나다\\n");
        for (const encoding of ["auto", "auto", "auto", "utf-16be"]) {
          original.setValue("loading");
          document.getElementById("originalEncoding").value = encoding;
          document.getElementById("btnOpenOriginal").click();
          await waitFor(() => original.getValue() === "가나다\\n");
        }
        document.getElementById("originalEncoding").value = "auto";
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9, 0x0a])], "dropped-cp949.txt"));
        original.setValue("loading drop");
        document.getElementById("originalEditor").dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
        await waitFor(() => original.getValue() === "가나다\\n");
        modified.setValue("가마바\\n");
        await new Promise(resolve => setTimeout(resolve, 400));
        check(!document.querySelector("[data-change]"), "Compared before the Compare button");
        document.getElementById("btnCompare").click();
        await waitFor(() => document.querySelector("[data-change]"));
        document.getElementById("btnSave").click();
        await waitFor(async () => (await window.skydiff.getComparisons()).length === 1);
        const saved = await window.skydiff.getComparisons();
        check(saved[0].original === "가나다\\n", "Saved text differs");
        document.getElementById("btnExport").click();
        await waitFor(() => document.getElementById("toast").textContent === window.SkyDiffI18n.t("exportComplete"));
        original.setValue(" "); modified.setValue("  ");
        document.getElementById("btnCompare").click();
        await waitFor(() => document.querySelector("[data-change]"));
        original.setValue(""); modified.setValue("");
        document.getElementById("btnCompare").click();
        check(!document.querySelector("[data-change]"), "Stale result after clearing inputs");
        // Keep a renderer heartbeat alive while a 100,000-line comparison runs.
        let ticks = 0;
        const heartbeat = setInterval(() => ticks++, 10);
        const large = Array.from({ length: 100000 }, (_, i) => "line " + i).join("\\n") + "\\n";
        original.setValue(large);
        modified.setValue(large + "extra\\n");
        document.getElementById("btnCompare").click();
        await waitFor(() => document.getElementById("diffContainer").getAttribute("aria-busy") === "false" && document.querySelector(".diff-row"));
        clearInterval(heartbeat);
        check(ticks > 0, "Renderer heartbeat stopped during comparison");
        check(document.querySelectorAll(".diff-row").length <= 400, "Result DOM is unbounded");
        check(!document.getElementById("resultPager").classList.contains("hidden"), "Missing large-result pager");
        document.getElementById("btnFirstChange").click();
        await waitFor(() => document.querySelector("[data-change]"));
        check(document.getElementById("diffContainer").textContent.includes("extra"), "First change did not navigate across pages");
        document.getElementById("btnReset").click();
        check(!document.querySelector("[data-change]"), "Reset left stale results");
        original.setValue(Array.from({ length: 20000 }, (_, i) => "left " + i).join("\\n"));
        modified.setValue(Array.from({ length: 20000 }, (_, i) => "right " + i).join("\\n"));
        document.getElementById("btnCompare").click();
        await new Promise(resolve => setTimeout(resolve, 50));
        document.getElementById("btnCancelCompare").click();
        check(document.getElementById("diffContainer").getAttribute("aria-busy") === "false", "Cancel left the UI busy");
        original.setValue("retry"); modified.setValue("retry");
        document.getElementById("btnCompare").click();
        await waitFor(() => document.getElementById("warningBanner").textContent === window.SkyDiffI18n.t("textsIdentical"));
        return { savedComparisons: saved.length, largeInputLines: 100000, heartbeatTicks: ticks, cancelAndRetry: "passed" };
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
