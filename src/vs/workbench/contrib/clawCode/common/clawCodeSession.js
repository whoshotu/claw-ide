"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawCodeSession = void 0;
const osMod = require('os');
const pathMod = require('path');
const fs = require('fs');
const fsp = fs.promises;
// ClawCodeSession: simple per-session store persisted to disk
class ClawCodeSession {
    constructor(sessionId) {
        this.sessionId = sessionId;
    }
    static generateSessionId() {
        const rand = Math.random().toString(36).slice(2, 8);
        return ClawCodeSession.SESSION_PREFIX + Date.now().toString(36) + '-' + rand;
    }
    async ensureDir() {
        try {
            await fsp.mkdir(ClawCodeSession.STORAGE_DIR, { recursive: true });
        }
        catch {
            // ignore if exists
        }
    }
    async saveMetadata(metadata) {
        await this.ensureDir();
        const p = pathMod.join(ClawCodeSession.STORAGE_DIR, this.sessionId + '.json');
        await fsp.writeFile(p, JSON.stringify(metadata), { encoding: 'utf8' });
    }
    async loadMetadata() {
        const p = pathMod.join(ClawCodeSession.STORAGE_DIR, this.sessionId + '.json');
        try {
            const data = await fsp.readFile(p, { encoding: 'utf8' });
            return JSON.parse(data);
        }
        catch {
            return null;
        }
    }
}
exports.ClawCodeSession = ClawCodeSession;
ClawCodeSession.SESSION_PREFIX = 'clawcode-';
ClawCodeSession.STORAGE_DIR = pathMod.join(osMod.homedir(), '.local/share', 'claw-ide', 'clawcode-sessions');
