"use strict";

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["vendor/**", "dist/**", "out/**", "node_modules/**"] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: "latest", sourceType: "commonjs" },
    rules: { "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] }
  },
  {
    files: ["eslint.config.js", "scripts/**/*.js", "tests/**/*.js", "src/main/**/*.js"],
    languageOptions: { globals: globals.node }
  },
  {
    files: ["src/renderer/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, monaco: "readonly", Diff: "readonly" }
    }
  },
  {
    files: ["src/renderer/js/diffWorker.js"],
    languageOptions: { globals: globals.worker }
  }
];
