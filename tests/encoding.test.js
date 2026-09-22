"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({ TextDecoder, Uint8Array });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/renderer/js/textDecoder.js"), "utf8"), context);
const { decode } = context.SkyDiffDecoder;
const text = "한글 가나다\r\nABC";
const cp949 = Buffer.from("c7d1b1db20b0a1b3aab4d90d0a414243", "hex");

test("UTF-8, UTF-8 BOM and CP949 preserve Korean and line endings", () => {
  for (const bytes of [Buffer.from(text), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]), cp949]) {
    assert.equal(decode(bytes).text, text);
  }
  assert.equal(decode(cp949).encoding, "CP949");
  // UHC extension bytes are checked in the Chromium smoke test; Node ICU differs.
});

test("UTF-16 LE and BE work with BOMs and with manual encoding selection", () => {
  const le = Buffer.from(text, "utf16le");
  const be = Buffer.from(le).swap16();
  for (const [encoding, bytes, bom] of [["utf-16le", le, [0xff, 0xfe]], ["utf-16be", be, [0xfe, 0xff]]]) {
    assert.equal(decode(Buffer.concat([Buffer.from(bom), bytes])).text, text);
    assert.equal(decode(bytes, encoding).text, text);
    const ascii = Buffer.from("hello\nworld", "utf16le");
    if (encoding === "utf-16be") ascii.swap16();
    assert.equal(decode(ascii).text, "hello\nworld");
  }
});

test("invalid byte sequences fail explicitly rather than silently replacing text", () => {
  assert.throws(() => decode(Uint8Array.from([0xff]), "utf-8"), /invalidEncoding/);
  assert.throws(() => decode(Uint8Array.from([0xa1]), "cp949"), /invalidEncoding/);
  assert.throws(() => decode(Uint8Array.from([0xff, 0xfe, 0x41])), /invalidEncoding/);
  assert.equal(decode(new Uint8Array()).text, "");
});
