declare var require: any;
const osMod = require('os');
const pathMod = require('path');
const fs = require('fs');
const fsp = fs.promises;

// ClawCodeSession: simple per-session store persisted to disk
export class ClawCodeSession {
  private static SESSION_PREFIX = 'clawcode-';
  private static STORAGE_DIR = pathMod.join(osMod.homedir(), '.local/share', 'claw-ide', 'clawcode-sessions');

  constructor(public sessionId: string) {}

  static generateSessionId(): string {
    const rand = Math.random().toString(36).slice(2, 8);
    return ClawCodeSession.SESSION_PREFIX + Date.now().toString(36) + '-' + rand;
  }

  private async ensureDir(): Promise<void> {
    try {
      await fsp.mkdir(ClawCodeSession.STORAGE_DIR, { recursive: true });
    } catch {
      // ignore if exists
    }
  }

  async saveMetadata(metadata: any): Promise<void> {
    await this.ensureDir();
    const p = pathMod.join(ClawCodeSession.STORAGE_DIR, this.sessionId + '.json');
    await fsp.writeFile(p, JSON.stringify(metadata), { encoding: 'utf8' });
  }

  async loadMetadata(): Promise<any> {
    const p = pathMod.join(ClawCodeSession.STORAGE_DIR, this.sessionId + '.json');
    try {
      const data = await fsp.readFile(p, { encoding: 'utf8' });
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}
