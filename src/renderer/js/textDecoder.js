"use strict";

(function (global) {
  const MAX_FILE_BYTES = 50 * 1024 * 1024;
  const labels = { "utf-8": "UTF-8", "utf-16le": "UTF-16 LE", "utf-16be": "UTF-16 BE", "euc-kr": "CP949" };

  function decode(bytes, encoding = "auto") {
    bytes = new Uint8Array(bytes);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("fileTooLarge");
    let selected = encoding === "cp949" ? "euc-kr" : encoding;
    if (selected === "auto") {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) selected = "utf-16le";
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) selected = "utf-16be";
      else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) selected = "utf-8";
      else {
        // BOM-less UTF-16 containing ASCII has NULs predominantly on one byte lane.
        const pairs = Math.min(Math.floor(bytes.length / 2), 4096);
        let even = 0, odd = 0;
        for (let i = 0; i < pairs * 2; i += 2) {
          if (bytes[i] === 0) even++;
          if (bytes[i + 1] === 0) odd++;
        }
        if (pairs && odd / pairs > 0.3 && even / pairs < 0.05) selected = "utf-16le";
        else if (pairs && even / pairs > 0.3 && odd / pairs < 0.05) selected = "utf-16be";
        else {
          try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" }; }
          catch { selected = "euc-kr"; }
        }
      }
    }
    if (!labels[selected]) throw new Error("invalidEncoding");
    try {
      return { text: new TextDecoder(selected, { fatal: true }).decode(bytes), encoding: labels[selected] };
    } catch (cause) {
      throw new Error("invalidEncoding", { cause });
    }
  }

  global.SkyDiffDecoder = { decode, MAX_FILE_BYTES };
})(globalThis);
