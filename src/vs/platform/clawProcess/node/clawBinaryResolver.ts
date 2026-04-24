// Lightweight, self-contained resolver avoiding external Node typings.
declare var process: any;
declare var require: any;

class SimpleEventEmitter {
  private listeners: { [event: string]: Array<(payload: any) => void> } = {};
  on(event: string, listener: (payload: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }
  emit(event: string, payload?: any) {
    (this.listeners[event] || []).forEach((cb) => cb(payload));
  }
}

export const clawBinaryResolverEvents = new SimpleEventEmitter();

export async function resolveClaudeBinary(): Promise<string | null> {
  // Step 1: settings key – use a lightweight environment override if present
  const envPath = (process && process.env && process.env['CLAUDE_BINARY_PATH']) || '';
  if (typeof envPath === 'string' && envPath.trim()) {
    return envPath.trim();
  }

  // Step 2: search PATH for claude without shell usage
  let fs: any;
  let pathMod: any;
  let osMod: any;
  try { fs = require('fs'); pathMod = require('path'); osMod = require('os'); } catch {
    // If runtime lacks node-like APIs, gracefully fail to null and surface setup
    clawBinaryResolverEvents.emit('setup-required', {
      reason: 'Node modules unavailable in runtime',
    });
    return null;
  }
  const isWindows = osMod && osMod.platform ? osMod.platform() === 'win32' : false;
  const binNames = isWindows ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const PATH = (process && process.env && process.env.PATH) || '';
  const delimiter = PATH.includes(';') ? ';' : ':';
  const dirs = PATH.split(delimiter).filter((d: string) => d);
  for (const dir of dirs) {
    for (const name of binNames) {
      const candidate = pathMod ? pathMod.join(dir, name) : dir + '/' + name;
      try {
        if (fs.existsSync(candidate)) {
          fs.accessSync(candidate, fs.constants?.X_OK ?? 0);
          return candidate;
        }
      } catch {
        // ignore
      }
    }
  }

  // Step 3: not found -> surface setup requirement
  clawBinaryResolverEvents.emit('setup-required', {
    reason: 'Claude binary not found on PATH and no CLAUDE_BINARY_PATH set',
  });
  return null;
}
