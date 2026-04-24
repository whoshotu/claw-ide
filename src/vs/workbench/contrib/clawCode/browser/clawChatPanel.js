"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawChatPanel = void 0;
class ClawChatPanel {
    constructor(claw) {
        this.claw = claw;
    }
    open() {
        // placeholder to initialize chat panel
    }
    sendQuestion(text) {
        const sessionId = 'claw-' + Date.now().toString(36);
        this.activeSession = sessionId;
        // start a session and stream output via onStream
        this.claw.onStream(sessionId, (chunk) => {
            // in real UI this would append to markdown panel
        });
        this.claw.onDone(sessionId, (_exit) => {
            // finalize
        });
        this.claw.onError(sessionId, (_err) => { });
        this.claw.spawn(sessionId, ['chat', text]);
    }
    abort() {
        if (this.activeSession)
            this.claw.cancel(this.activeSession);
    }
}
exports.ClawChatPanel = ClawChatPanel;
