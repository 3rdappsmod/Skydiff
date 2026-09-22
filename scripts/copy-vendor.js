// postinstall: 렌더러(<script> 태그, contextIsolation)에서 그대로 로드할 정적 자산을
// node_modules 에서 vendor/ 로 복사한다. vendor/ 는 git에 커밋하지 않고 설치 시마다 재생성한다.
//  - monaco-editor: 전체(수백 MB) 대신 min/vs 정적 리소스만
//  - diff (jsdiff): 브라우저용 UMD 번들(dist/diff.min.js, window.Diff 전역 노출)
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function copyMonaco() {
  const src = path.join(ROOT, "node_modules", "monaco-editor", "min", "vs");
  const dest = path.join(ROOT, "vendor", "monaco", "vs");
  if (!fs.existsSync(src)) {
    console.warn("[copy-vendor] monaco-editor 를 찾을 수 없습니다:", src);
    return;
  }
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  copyRecursive(src, dest);
  console.log("[copy-vendor] monaco-editor min/vs ->", dest);
}

function copyJsDiff() {
  const src = path.join(ROOT, "node_modules", "diff", "dist", "diff.min.js");
  const dest = path.join(ROOT, "vendor", "diff", "diff.min.js");
  if (!fs.existsSync(src)) {
    console.warn("[copy-vendor] diff (jsdiff) 를 찾을 수 없습니다:", src);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("[copy-vendor] diff/dist/diff.min.js ->", dest);
}

copyMonaco();
copyJsDiff();
