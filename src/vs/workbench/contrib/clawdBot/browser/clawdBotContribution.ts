// Registration of Clawd Bot contributions (P3)
import { ClawdBotPanel } from './clawdBotPanel';
import { ClawdBotStatusBar } from './clawdBotStatusBar';
import { ClawdBotTaskQueue } from './clawdBotTaskQueue';

export function registerClawdBotContributions(_service: any) {
  const panel = new ClawdBotPanel();
  const statusBar = new ClawdBotStatusBar(panel);
  const queue = new ClawdBotTaskQueue(null as any);
  // Expose globally for debug and potential UI hookup in this scaffold
  (globalThis as any).clawdBotPanel = panel;
  (globalThis as any).clawdBotStatusBar = statusBar;
  (globalThis as any).clawdBotTaskQueue = queue;
}
