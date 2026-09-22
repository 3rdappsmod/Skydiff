"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Diff = require("diff");

function engine(diff = Diff) {
  const context = vm.createContext({ Diff: diff });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/renderer/js/diffEngine.js"), "utf8"), context);
  return context.SkyDiffEngine;
}

test("aborted line comparisons report a timeout instead of an identical result", () => {
  assert.throws(() => engine({ ...Diff, diffLines: () => undefined }).compute("a", "b", {}), /comparisonTimeout/);
});

test("line-count limits fail explicitly before diffing", () => {
  assert.throws(() => engine().compute("a\n".repeat(500000), "", {}), /tooManyLines/);
});
