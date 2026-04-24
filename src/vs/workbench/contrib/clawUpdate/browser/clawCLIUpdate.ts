// Auto-update Layer 2 — claude CLI (P4)
import { IClawProcessService } from '../../../../platform/clawProcess/common/clawProcess';

export class ClawCLIUpdate {
  constructor(private claw: IClawProcessService) {}
  async checkClaudeUpdates(): Promise<string | null> {
    const sessionId = 'claw-cli-update-' + Date.now().toString(36);
    return new Promise<string | null>((resolve) => {
      let output = '';
      this.claw.onStream(sessionId, (chunk) => (output += chunk));
      this.claw.onDone(sessionId, (exitCode) => {
        resolve(exitCode === 0 ? output.trim() : null);
      });
      this.claw.onError(sessionId, (_err) => resolve(null));
      this.claw.spawn(sessionId, ['update', '-- Claude CLI']);
    });
  }
}
