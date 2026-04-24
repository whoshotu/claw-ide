// Local minimal worker stub (avoids cross-dir TypeScript resolution in this scaffold)
type ClawdBotWorker = any;

export class ClawdBotTaskQueue {
  private queue: Array<{ taskName: string; payload?: any }> = [];
  private worker: ClawdBotWorker | null = null;
  constructor(worker?: ClawdBotWorker) {
    this.worker = worker || null;
  }
  enqueue(task: { taskName: string; payload?: any }) {
    this.queue.push(task);
  }
  async processNext() {
    if (!this.worker) return;
    const next = this.queue.shift();
    if (!next) return;
    // Run via worker by creating a new spawn task on the service via session
    // Here we simply trigger a wrapper task; actual implementation is abstracted
    // We'll reuse worker's spawn logic by calling a synthetic method on the worker
    // but since we can't access internal service here, just simulate a start
    // In a fuller impl, this would call worker.run(next)
  }
}
