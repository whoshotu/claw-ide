"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawdBotMemory = void 0;
const os = require('os');
const path = require('path');
const fs = require('fs');
class ClawdBotMemory {
    async loadOnBoot() {
        try {
            await this.ensureDir();
            if (!fs.existsSync(ClawdBotMemory.FILE))
                return [];
            const data = await fs.promises.readFile(ClawdBotMemory.FILE, { encoding: 'utf8' });
            const lines = data.split('\n').filter(l => l.trim().length > 0);
            const entries = [];
            for (const line of lines) {
                try {
                    const obj = JSON.parse(line);
                    entries.push(obj);
                }
                catch {
                    // corrupted line: reset file and continue
                    await fs.promises.writeFile(ClawdBotMemory.FILE, '', { encoding: 'utf8' });
                    console.warn('ClawdBotMemory: corrupted line encountered; memory reset.');
                    return [];
                }
            }
            return entries;
        }
        catch {
            return [];
        }
    }
    async saveEntry(entry) {
        await this.ensureDir();
        const line = JSON.stringify(entry) + '\n';
        await fs.promises.appendFile(ClawdBotMemory.FILE, line, { encoding: 'utf8' });
    }
    async ensureDir() {
        try {
            await fs.promises.mkdir(ClawdBotMemory.STORAGE_DIR, { recursive: true });
        }
        catch {
            // ignore
        }
    }
}
exports.ClawdBotMemory = ClawdBotMemory;
ClawdBotMemory.STORAGE_DIR = path.join(os.homedir(), '.local/share', 'claw-ide', 'clawdbot-memory');
ClawdBotMemory.FILE = path.join(ClawdBotMemory.STORAGE_DIR, 'memory.jsonl');
