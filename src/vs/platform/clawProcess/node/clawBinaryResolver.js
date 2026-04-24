"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveClaudeBinary = exports.clawBinaryResolverEvents = void 0;
class SimpleEventEmitter {
    constructor() {
        this.listeners = {};
    }
    on(event, listener) {
        if (!this.listeners[event])
            this.listeners[event] = [];
        this.listeners[event].push(listener);
    }
    emit(event, payload) {
        (this.listeners[event] || []).forEach((cb) => cb(payload));
    }
}
exports.clawBinaryResolverEvents = new SimpleEventEmitter();
async function resolveClaudeBinary() {
    var _a, _b;
    // Step 1: settings key – use a lightweight environment override if present
    const envPath = (process && process.env && process.env['CLAUDE_BINARY_PATH']) || '';
    if (typeof envPath === 'string' && envPath.trim()) {
        return envPath.trim();
    }
    // Step 2: search PATH for claude without shell usage
    let fs;
    let pathMod;
    let osMod;
    try {
        fs = require('fs');
        pathMod = require('path');
        osMod = require('os');
    }
    catch {
        // If runtime lacks node-like APIs, gracefully fail to null and surface setup
        exports.clawBinaryResolverEvents.emit('setup-required', {
            reason: 'Node modules unavailable in runtime',
        });
        return null;
    }
    const isWindows = osMod && osMod.platform ? osMod.platform() === 'win32' : false;
    const binNames = isWindows ? ['claude.exe', 'claude.cmd'] : ['claude'];
    const PATH = (process && process.env && process.env.PATH) || '';
    const delimiter = PATH.includes(';') ? ';' : ':';
    const dirs = PATH.split(delimiter).filter((d) => d);
    for (const dir of dirs) {
        for (const name of binNames) {
            const candidate = pathMod ? pathMod.join(dir, name) : dir + '/' + name;
            try {
                if (fs.existsSync(candidate)) {
                    fs.accessSync(candidate, (_b = (_a = fs.constants) === null || _a === void 0 ? void 0 : _a.X_OK) !== null && _b !== void 0 ? _b : 0);
                    return candidate;
                }
            }
            catch {
                // ignore
            }
        }
    }
    // Step 3: not found -> surface setup requirement
    exports.clawBinaryResolverEvents.emit('setup-required', {
        reason: 'Claude binary not found on PATH and no CLAUDE_BINARY_PATH set',
    });
    return null;
}
exports.resolveClaudeBinary = resolveClaudeBinary;
