// Simple status bar model for Clawd Bot (P3)
export enum ClawdBotStatus {
  Idle = 'idle',
  Working = 'working',
  Error = 'error'
}

export class ClawdBotStatusBar {
  private state: ClawdBotStatus = ClawdBotStatus.Idle;
  private panel?: any;
  constructor(panel?: any) {
    this.panel = panel;
  }
  getState(): ClawdBotStatus { return this.state; }
  setState(s: ClawdBotStatus) { this.state = s; }
  onClick() {
    if (this.panel && typeof this.panel.open === 'function') this.panel.open();
  }
}
