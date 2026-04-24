// Node-side process service implementation (P1): fully wired lifecycle management
import { IClawProcessService } from "../common/clawProcess";

// Use dynamic require to avoid hard Node typings in TS config
declare var require: any;
declare var process: any;

export class ClawProcessService implements IClawProcessService {
  private sessions = new Map<string, any>();

  constructor() {}

  async spawn(sessionId: string, args: string[]): Promise<void> {
    const cp = require('child_process');
    const binary = 'claude';
    const child = cp.spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });

    const sess = {
      proc: child,
      args,
      streams: [] as Array<(chunk: string) => void>,
      done: undefined as undefined | ((exitCode: number) => void),
      errorHandler: undefined as undefined | ((err: Error) => void),
      restarted: false as boolean,
      timer: undefined as any
    };
    this.sessions.set(sessionId, sess);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      for (const h of sess.streams) h(chunk);
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      for (const h of sess.streams) h(chunk);
    });

    child.on('exit', (code: number, signal: string) => {
      const exitCode = (typeof code === 'number') ? code : (signal ? 128 : 0);
      if (sess.done) sess.done(exitCode);
      if (!sess.restarted && exitCode !== 0) {
        sess.restarted = true;
        try {
          const newChild = cp.spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
          sess.proc = newChild;
          newChild.stdout?.setEncoding('utf8');
          newChild.stdout?.on('data', (d: string) => { sess.streams.forEach(h => h(d)); });
          newChild.stderr?.setEncoding('utf8');
          newChild.stderr?.on('data', (d: string) => { sess.streams.forEach(h => h(d)); });
          newChild.on('exit', (code2: number, sig2: string) => {
            if ((code2 ?? 0) !== 0 && sess.errorHandler) {
              sess.errorHandler(new Error(`Claude process crashed again with code ${code2}`));
            }
          });
        } catch (e) {
          if (sess.errorHandler) sess.errorHandler(new Error('Claude process restart failed'));
        }
      }
    });

    const timer = setTimeout(() => {
      if (sess.proc && !sess.proc.killed) {
        try { sess.proc.kill('SIGTERM'); } catch {}
        setTimeout(() => {
          if (sess.proc && !sess.proc.killed) {
            try { sess.proc.kill('SIGKILL'); } catch {}
            if (sess.errorHandler) sess.errorHandler(new Error('Claude process killed after timeout'));
          }
        }, 3000);
      }
    }, 30000);
    sess.timer = timer;
  }

  cancel(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s || !s.proc) return;
    try { s.proc.kill('SIGTERM'); } catch {}
  }

  async getVersion(): Promise<string> {
    // Spawn claude --version and capture stdout without shell
    const cp = require('child_process');
    return new Promise<string>((resolve, reject) => {
      try {
        const child = cp.spawn('claude', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
        let output = '';
        if (child.stdout) {
          child.stdout.setEncoding('utf8');
          child.stdout.on('data', (chunk: string) => {
            output += chunk;
          });
        }
        // Optional: capture stderr to help diagnose issues
        if (child.stderr) {
          child.stderr.setEncoding('utf8');
          child.stderr.on('data', (chunk: string) => {
            // Append to output for visibility in case claude prints to stderr
            output += chunk;
          });
        }
        child.on('error', (err: Error) => {
          reject(err);
        });
        child.on('close', (code: number) => {
          resolve(output.trim());
        });
      } catch (e) {
        reject(e as any);
      }
    });
  }

  onStream(sessionId: string, handler: (chunk: string) => void): void {
    const s = this.sessions.get(sessionId);
    if (!s) {
      this.sessions.set(sessionId, { streams: [handler] });
    } else {
      s.streams.push(handler);
    }
  }

  onDone(sessionId: string, handler: (exitCode: number) => void): void {
    const s = this.sessions.get(sessionId) || { streams: [], done: undefined };
    (s as any).done = handler;
  }

  onError(sessionId: string, handler: (err: Error) => void): void {
    const s = this.sessions.get(sessionId) || { streams: [], errorHandler: undefined };
    (s as any).errorHandler = handler;
  }
}
