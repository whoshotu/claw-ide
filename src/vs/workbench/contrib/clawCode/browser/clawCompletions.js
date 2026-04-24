"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawCompletionsProvider = void 0;
class ClawCompletionsProvider {
    constructor(claw) {
        this.claw = claw;
    }
    async provideInlineCompletion(context) {
        const sessionId = 'claw-' + Date.now().toString(36);
        return new Promise((resolve, reject) => {
            let acc = '';
            this.claw.onStream(sessionId, (chunk) => {
                acc += chunk;
            });
            this.claw.onDone(sessionId, (exitCode) => {
                if (exitCode === 0)
                    resolve(acc.trim());
                else
                    resolve(undefined);
            });
            this.claw.onError(sessionId, (err) => reject(err));
            this.claw.spawn(sessionId, ['complete', JSON.stringify(context)]).catch(reject);
        });
    }
}
exports.ClawCompletionsProvider = ClawCompletionsProvider;
