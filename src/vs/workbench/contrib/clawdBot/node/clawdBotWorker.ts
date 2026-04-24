// Lightweight worker wired to a generic event bus; avoids Node EventEmitter typings
type IClawProcessService = any;
import { CLAWD_TASK_ERROR } from '../common/clawdBotEvents';

export type ClawBotEventMap = {
  fileSaved: any;
  buildFailed: any;
  gitCommit: any;
};

export class ClawdBotWorker {
  private eventBus: any;
  private taskTimeoutMs: number;
  constructor(private service: IClawProcessService, eventBus: any, taskTimeout?: number) {
    this.eventBus = eventBus;
    this.taskTimeoutMs = typeof taskTimeout === 'number' ? taskTimeout : 120000; // default 120s
  }

  start() {
    // Subscribe to a few pseudo-events; in a real environment these would be VSCode events
    this.eventBus.on('fileSaved', (payload) => this.runTask({ type: 'fileSave', payload }));
    this.eventBus.on('buildFailed', (payload) => this.runTask({ type: 'build', payload }));
    this.eventBus.on('gitCommit', (payload) => this.runTask({ type: 'git', payload }));
  }

  private runTask(task: { type: string; payload: any }) {
    const sessionId = 'clawd-' + Date.now().toString(36);
    // Simple mapping: every task triggers a spawn of claude with a task description
    const args = ['task', JSON.stringify({ type: task.type, payload: task.payload })];
    const timer = setTimeout(() => {
      this.service.cancel(sessionId);
      // Notify timeout as task error
      this.eventBus.emit(CLAWD_TASK_ERROR, { sessionId, reason: 'timeout' });
    }, this.taskTimeoutMs);
    this.service.spawn(sessionId, args).then(() => {
      clearTimeout(timer);
      // When done we could emit CLAWD_DONE; keep simple: nothing here
    }).catch((e) => {
      clearTimeout(timer);
      this.eventBus.emit(CLAWD_TASK_ERROR, { sessionId, reason: (e && (e as any).message) || 'error' });
    });
  }
}
