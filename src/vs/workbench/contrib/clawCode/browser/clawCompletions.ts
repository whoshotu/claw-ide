// Inline ghost text completions for Claw Code (P2)
import { IClawProcessService } from "../../../../platform/clawProcess/common/clawProcess";
import { CLAW_STREAM, CLAW_DONE, CLAW_ERROR } from "../common/clawCodeEvents";

export class ClawCompletionsProvider {
  constructor(private claw: IClawProcessService) {}

  async provideInlineCompletion(context: any): Promise<string | undefined> {
    const sessionId = 'claw-' + Date.now().toString(36);
    return new Promise<string | undefined>((resolve, reject) => {
      let acc = '';
      this.claw.onStream(sessionId, (chunk) => {
        acc += chunk;
      });
      this.claw.onDone(sessionId, (exitCode) => {
        if (exitCode === 0) resolve(acc.trim()); else resolve(undefined);
      });
      this.claw.onError(sessionId, (err) => reject(err));
      this.claw.spawn(sessionId, ['complete', JSON.stringify(context)]).catch(reject);
    });
  }
}
