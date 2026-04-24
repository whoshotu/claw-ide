declare var require: any;
const os = require('os');
const path = require('path');
const fs = require('fs');

type Entry = {
  timestamp: number;
  role: string;
  content: string;
  tool_calls?: any;
  session_id: string;
};

export class ClawdBotMemory {
  private static STORAGE_DIR = path.join(os.homedir(), '.local/share', 'claw-ide', 'clawdbot-memory');
  private static FILE = path.join(ClawdBotMemory.STORAGE_DIR, 'memory.jsonl');

  async loadOnBoot(): Promise<Entry[]> {
    try {
      await this.ensureDir();
      if (!fs.existsSync(ClawdBotMemory.FILE)) return [];
      const data = await fs.promises.readFile(ClawdBotMemory.FILE, { encoding: 'utf8' });
      const lines = data.split('\n').filter(l => l.trim().length > 0);
      const entries: Entry[] = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line) as Entry;
          entries.push(obj);
        } catch {
          // corrupted line: reset file and continue
          await fs.promises.writeFile(ClawdBotMemory.FILE, '', { encoding: 'utf8' });
          console.warn('ClawdBotMemory: corrupted line encountered; memory reset.');
          return [];
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  async saveEntry(entry: Entry): Promise<void> {
    await this.ensureDir();
    const line = JSON.stringify(entry) + '\n';
    await fs.promises.appendFile(ClawdBotMemory.FILE, line, { encoding: 'utf8' });
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.promises.mkdir(ClawdBotMemory.STORAGE_DIR, { recursive: true });
    } catch {
      // ignore
    }
  }
}
