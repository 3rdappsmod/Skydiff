"use strict";

function trackWindowBounds(window, store) {
  let timer;
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!window.isDestroyed()) {
      store.set("windowBounds", { ...window.getNormalBounds(), maximized: window.isMaximized() });
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }
  window.on("move", schedule);
  window.on("resize", schedule);
  window.on("close", flush);
  window.on("closed", () => clearTimeout(timer));
}

module.exports = { trackWindowBounds };
