import { IClawProcessService } from '../../../../platform/clawProcess/common/clawProcess';
import { resolveClaudeBinary } from '../../../../platform/clawProcess/node/clawBinaryResolver';

export class ClawOnboarding {
  constructor(private service: IClawProcessService) {}
  async run(): Promise<void> {
    // Step 1: Welcome
    console.info('[ClawOnboarding] Welcome to Claw IDE onboarding (P4)');
    // Step 2: Locate claude binary
    const binPath = await resolveClaudeBinary();
    if (!binPath) {
      console.info('[ClawOnboarding] Claude binary not found yet. Prompt user to configure CLAUDE_BINARY_PATH.');
      return;
    }
    // Step 3: Test binary + show version
    const sessionId = 'onboard-' + Date.now().toString(36);
    this.service.onStream(sessionId, (_chunk) => {});
    this.service.onDone(sessionId, (exitCode) => {
      // no-op in this scaffold
    });
    this.service.onError(sessionId, (_err) => {});
    this.service.spawn(sessionId, [binPath, '--version']);
  }
}
