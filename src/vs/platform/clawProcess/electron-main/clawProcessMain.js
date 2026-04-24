"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerClawProcessMain = void 0;
// Electron main entry (P1): register ClawProcessService singleton and wire binary resolver
const clawProcessService_1 = require("../node/clawProcessService");
const clawBinaryResolver_1 = require("../node/clawBinaryResolver");
function registerClawProcessMain() {
    // Simple singleton registration on global for this scaffold
    const service = new clawProcessService_1.ClawProcessService();
    globalThis.clawProcessService = service;
    // Wire a simple command surface to check Claude binary availability
    globalThis.checkClaudeBinary = async () => {
        try {
            const path = await (0, clawBinaryResolver_1.resolveClaudeBinary)();
            return path;
        }
        catch {
            return null;
        }
    };
}
exports.registerClawProcessMain = registerClawProcessMain;
