"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function clientFixture() {
  const workers = [], timers = new Map();
  let timerId = 0;
  class Worker {
    constructor() { this.messages = []; workers.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
  }
  const window = { Worker };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/renderer/js/workerClient.js"), "utf8"), {
    window,
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  });
  return { client: new window.SkyDiffWorkerClient(), workers, timers };
}

test("cancel terminates pending work and rejects old requests without poisoning new work", async () => {
  const { client, workers, timers } = clientFixture();
  const old = client.request("compare", {});
  const rejected = assert.rejects(old, /operationCanceled/);
  client.cancel();
  await rejected;
  assert.equal(workers[0].terminated, true);
  assert.equal(timers.size, 0);
  const next = client.request("compare", {});
  workers[0].onmessage({ data: { id: workers[0].messages[0].id, value: "stale" } });
  workers[1].onmessage({ data: { id: workers[1].messages[0].id, value: "current" } });
  assert.equal(await next, "current");
});

test("hung work times out, terminates its worker, and allows a retry", async () => {
  const { client, workers, timers } = clientFixture();
  const pending = client.request("compare", {});
  const rejected = assert.rejects(pending, /comparisonTimeout/);
  [...timers.values()][0]();
  await rejected;
  assert.equal(workers[0].terminated, true);
  const retry = client.request("page", { index: 0 });
  workers[1].onmessage({ data: { id: workers[1].messages[0].id, value: [] } });
  assert.deepEqual(await retry, []);
});

test("worker startup/runtime errors reject requests rather than leaving the UI busy", async () => {
  const { client, workers } = clientFixture();
  const pending = client.request("compare", {});
  const rejected = assert.rejects(pending, /operationFailed/);
  workers[0].onerror();
  await rejected;
});
