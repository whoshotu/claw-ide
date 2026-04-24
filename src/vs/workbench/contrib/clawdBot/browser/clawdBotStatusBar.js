"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawdBotStatusBar = exports.ClawdBotStatus = void 0;
// Simple status bar model for Clawd Bot (P3)
var ClawdBotStatus;
(function (ClawdBotStatus) {
    ClawdBotStatus["Idle"] = "idle";
    ClawdBotStatus["Working"] = "working";
    ClawdBotStatus["Error"] = "error";
})(ClawdBotStatus = exports.ClawdBotStatus || (exports.ClawdBotStatus = {}));
class ClawdBotStatusBar {
    constructor(panel) {
        this.state = ClawdBotStatus.Idle;
        this.panel = panel;
    }
    getState() { return this.state; }
    setState(s) { this.state = s; }
    onClick() {
        if (this.panel && typeof this.panel.open === 'function')
            this.panel.open();
    }
}
exports.ClawdBotStatusBar = ClawdBotStatusBar;
