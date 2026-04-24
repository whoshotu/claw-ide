// Simple chat panel scaffold for Claw Code (P2)
import { IClawProcessService } from "../../../../platform/clawProcess/common/clawProcess";
import { CLAW_STREAM, CLAW_DONE, CLAW_ERROR, CLAW_DIFF_READY } from "../common/clawCodeEvents";

export class ClawChatPanel {
  private activeSession?: string;
  constructor(private claw: IClawProcessService) {}

  open() {
    // placeholder to initialize chat panel
  }

  sendQuestion(text: string) {
    const sessionId = 'claw-' + Date.now().toString(36);
    this.activeSession = sessionId;
    // start a session and stream output via onStream
    this.claw.onStream(sessionId, (chunk) => {
      // in real UI this would append to markdown panel
    });
    this.claw.onDone(sessionId, (_exit) => {
      // finalize
    });
    this.claw.onError(sessionId, (_err) => {});
    this.claw.spawn(sessionId, ['chat', text]);
  }

  abort() {
    if (this.activeSession) this.claw.cancel(this.activeSession);
  }
}
