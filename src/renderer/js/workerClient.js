"use strict";

(function (global) {
  class WorkerClient {
    constructor() {
      this.worker = null;
      this.pending = new Map();
      this.nextId = 0;
    }

    cancel(reason = "operationCanceled") {
      if (this.worker) this.worker.terminate();
      this.worker = null;
      for (const task of this.pending.values()) {
        clearTimeout(task.timer);
        task.reject(new Error(reason));
      }
      this.pending.clear();
    }

    request(type, payload, transfer = []) {
      if (!this.worker) {
        this.worker = new global.Worker("js/diffWorker.js");
        const worker = this.worker;
        this.worker.onmessage = ({ data }) => {
          if (this.worker !== worker) return;
          const task = this.pending.get(data.id);
          if (!task) return;
          this.pending.delete(data.id);
          clearTimeout(task.timer);
          if (data.error) task.reject(new Error(data.error));
          else task.resolve(data.value);
        };
        this.worker.onerror = () => { if (this.worker === worker) this.cancel("operationFailed"); };
        this.worker.onmessageerror = this.worker.onerror;
      }
      return new Promise((resolve, reject) => {
        const id = ++this.nextId;
        const timer = setTimeout(() => this.cancel("comparisonTimeout"), 30000);
        this.pending.set(id, { resolve, reject, timer });
        try { this.worker.postMessage({ id, type, payload }, transfer); }
        catch { this.cancel("operationFailed"); }
      });
    }
  }

  global.SkyDiffWorkerClient = WorkerClient;
})(window);
