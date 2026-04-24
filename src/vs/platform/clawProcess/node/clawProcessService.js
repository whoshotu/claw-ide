"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawProcessService = void 0;
class ClawProcessService {
    constructor() {
        this.sessions = new Map();
    }
    async spawn(sessionId, args) {
        var _a, _b, _c, _d;
        const cp = require('child_process');
        const binary = 'claude';
        const child = cp.spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
        const sess = {
            proc: child,
            args,
            streams: [],
            done: undefined,
            errorHandler: undefined,
            restarted: false,
            timer: undefined
        };
        this.sessions.set(sessionId, sess);
        (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.setEncoding('utf8');
        (_b = child.stdout) === null || _b === void 0 ? void 0 : _b.on('data', (chunk) => {
            for (const h of sess.streams)
                h(chunk);
        });
        (_c = child.stderr) === null || _c === void 0 ? void 0 : _c.setEncoding('utf8');
        (_d = child.stderr) === null || _d === void 0 ? void 0 : _d.on('data', (chunk) => {
            for (const h of sess.streams)
                h(chunk);
        });
        child.on('exit', (code, signal) => {
            var _a, _b, _c, _d;
            const exitCode = (typeof code === 'number') ? code : (signal ? 128 : 0);
            if (sess.done)
                sess.done(exitCode);
            if (!sess.restarted && exitCode !== 0) {
                sess.restarted = true;
                try {
                    const newChild = cp.spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
                    sess.proc = newChild;
                    (_a = newChild.stdout) === null || _a === void 0 ? void 0 : _a.setEncoding('utf8');
                    (_b = newChild.stdout) === null || _b === void 0 ? void 0 : _b.on('data', (d) => { sess.streams.forEach(h => h(d)); });
                    (_c = newChild.stderr) === null || _c === void 0 ? void 0 : _c.setEncoding('utf8');
                    (_d = newChild.stderr) === null || _d === void 0 ? void 0 : _d.on('data', (d) => { sess.streams.forEach(h => h(d)); });
                    newChild.on('exit', (code2, sig2) => {
                        if ((code2 !== null && code2 !== void 0 ? code2 : 0) !== 0 && sess.errorHandler) {
                            sess.errorHandler(new Error(`Claude process crashed again with code ${code2}`));
                        }
                    });
                }
                catch (e) {
                    if (sess.errorHandler)
                        sess.errorHandler(new Error('Claude process restart failed'));
                }
            }
        });
        const timer = setTimeout(() => {
            if (sess.proc && !sess.proc.killed) {
                try {
                    sess.proc.kill('SIGTERM');
                }
                catch { }
                setTimeout(() => {
                    if (sess.proc && !sess.proc.killed) {
                        try {
                            sess.proc.kill('SIGKILL');
                        }
                        catch { }
                        if (sess.errorHandler)
                            sess.errorHandler(new Error('Claude process killed after timeout'));
                    }
                }, 3000);
            }
        }, 30000);
        sess.timer = timer;
    }
    cancel(sessionId) {
        const s = this.sessions.get(sessionId);
        if (!s || !s.proc)
            return;
        try {
            s.proc.kill('SIGTERM');
        }
        catch { }
    }
    async getVersion() {
        // Spawn claude --version and capture stdout without shell
        const cp = require('child_process');
        return new Promise((resolve, reject) => {
            try {
                const child = cp.spawn('claude', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
                let output = '';
                if (child.stdout) {
                    child.stdout.setEncoding('utf8');
                    child.stdout.on('data', (chunk) => {
                        output += chunk;
                    });
                }
                // Optional: capture stderr to help diagnose issues
                if (child.stderr) {
                    child.stderr.setEncoding('utf8');
                    child.stderr.on('data', (chunk) => {
                        // Append to output for visibility in case claude prints to stderr
                        output += chunk;
                    });
                }
                child.on('error', (err) => {
                    reject(err);
                });
                child.on('close', (code) => {
                    resolve(output.trim());
                });
            }
            catch (e) {
                reject(e);
            }
        });
    }
    onStream(sessionId, handler) {
        const s = this.sessions.get(sessionId);
        if (!s) {
            this.sessions.set(sessionId, { streams: [handler] });
        }
        else {
            s.streams.push(handler);
        }
    }
    onDone(sessionId, handler) {
        const s = this.sessions.get(sessionId) || { streams: [], done: undefined };
        s.done = handler;
    }
    onError(sessionId, handler) {
        const s = this.sessions.get(sessionId) || { streams: [], errorHandler: undefined };
        s.errorHandler = handler;
    }
}
exports.ClawProcessService = ClawProcessService;
