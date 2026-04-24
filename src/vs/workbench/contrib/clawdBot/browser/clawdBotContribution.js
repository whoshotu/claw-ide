"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerClawdBotContributions = void 0;
// Registration of Clawd Bot contributions (P3)
const clawdBotPanel_1 = require("./clawdBotPanel");
const clawdBotStatusBar_1 = require("./clawdBotStatusBar");
const clawdBotTaskQueue_1 = require("./clawdBotTaskQueue");
function registerClawdBotContributions(_service) {
    const panel = new clawdBotPanel_1.ClawdBotPanel();
    const statusBar = new clawdBotStatusBar_1.ClawdBotStatusBar(panel);
    const queue = new clawdBotTaskQueue_1.ClawdBotTaskQueue(null);
    // Expose globally for debug and potential UI hookup in this scaffold
    globalThis.clawdBotPanel = panel;
    globalThis.clawdBotStatusBar = statusBar;
    globalThis.clawdBotTaskQueue = queue;
}
exports.registerClawdBotContributions = registerClawdBotContributions;
