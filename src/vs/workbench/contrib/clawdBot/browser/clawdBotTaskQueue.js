"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawdBotTaskQueue = void 0;
class ClawdBotTaskQueue {
    constructor(worker) {
        this.queue = [];
        this.worker = null;
        this.worker = worker || null;
    }
    enqueue(task) {
        this.queue.push(task);
    }
    async processNext() {
        if (!this.worker)
            return;
        const next = this.queue.shift();
        if (!next)
            return;
        // Run via worker by creating a new spawn task on the service via session
        // Here we simply trigger a wrapper task; actual implementation is abstracted
        // We'll reuse worker's spawn logic by calling a synthetic method on the worker
        // but since we can't access internal service here, just simulate a start
        // In a fuller impl, this would call worker.run(next)
    }
}
exports.ClawdBotTaskQueue = ClawdBotTaskQueue;
