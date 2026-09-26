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

// 세 가지 비교 단위(스마트/단어/글자)의 정확한 스펙:
// "hotdoghotdoghotdog" -> "hotdoghotdoghotsausage" (공백 없는 문자열)
//  - 스마트: 실제로 다른 부분("dog" -> "sausage")만 짚어낸다.
//  - 글자: 짧은 공통 문자도 보존한다.
//  - 단어: 공백 기준 토큰이라 전체가 통째로 1개 단어 교체로 표시된다.

function onlyChangedText(tokens) {
  return tokens.filter((t) => t.kind !== "plain").map((t) => t.text).join("");
}

test("smart granularity finds the actual difference even without word boundaries", () => {
  const { rows } = engine().compute("hotdoghotdoghotdog", "hotdoghotdoghotsausage", { granularity: "smart" });
  const [{ original, modified }] = rows;
  assert.equal(onlyChangedText(original.tokens), "dog");
  assert.equal(onlyChangedText(modified.tokens), "sausage");
});

test("character mode preserves short common fragments while smart mode groups edits", () => {
  const chars = engine().compute("a1b", "x1y", { granularity: "char" }).rows[0];
  assert.equal(onlyChangedText(chars.original.tokens), "ab");
  assert.equal(onlyChangedText(chars.modified.tokens), "xy");
  assert.equal(chars.original.tokens.find((part) => part.kind === "plain").text, "1");
  const smart = engine().compute("a1b", "x1y", { granularity: "smart" }).rows[0];
  assert.equal(onlyChangedText(smart.original.tokens), "a1b");
});

for (const [granularity, method] of [["smart", "diffWordsWithSpace"], ["smart", "diffChars"], ["char", "diffChars"], ["word", "diffWords"]]) {
  test(`${granularity} handles ${method} timing out without losing line results`, () => {
    const result = engine({ ...Diff, [method]: () => undefined }).compute("abc", "xyz", { granularity });
    assert.equal(result.detailLimited, true);
    assert.equal(result.identical, false);
    assert.equal(result.stats.added, 1);
    assert.equal(result.stats.removed, 1);
    assert.equal(result.rows[0].original.tokens[0].text, "abc");
    assert.equal(result.rows[0].modified.tokens[0].text, "xyz");
  });
}

test("word granularity replaces the whole whitespace-free line as one token", () => {
  const { rows } = engine().compute("hotdoghotdoghotdog", "hotdoghotdoghotsausage", { granularity: "word" });
  const [{ original, modified }] = rows;
  assert.equal(original.tokens.length, 1);
  assert.equal(original.tokens[0].kind, "removed");
  assert.equal(original.tokens[0].text, "hotdoghotdoghotdog");
  assert.equal(modified.tokens.length, 1);
  assert.equal(modified.tokens[0].kind, "added");
  assert.equal(modified.tokens[0].text, "hotdoghotdoghotsausage");
});
