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

test("smart granularity finds the common prefix even without word boundaries", () => {
  const { rows } = engine().compute("hotdoghotdoghotdog", "hotdoghotdoghotsausage", { granularity: "smart" });
  const [{ original, modified }] = rows;
  assert.equal(original.tokens[0].kind, "plain");
  assert.equal(original.tokens[0].text, "hotdoghotdoghot");
  assert.equal(modified.tokens[0].kind, "plain");
  assert.equal(modified.tokens[0].text, "hotdoghotdoghot");
  assert.ok(original.tokens.some((t) => t.kind === "removed"));
  assert.ok(modified.tokens.some((t) => t.kind === "added"));
});
