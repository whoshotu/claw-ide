"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawdBotPanel = void 0;
// Simple Clawd Bot panel (P3) – conversation, tasks, and MCP status
class ClawdBotPanel {
    constructor() {
        this.history = [];
        this.tasks = [];
        this.mcpInvocations = [];
    }
    open() {
        // placeholder show panel
    }
    addMessage(role, content) {
        this.history.push({ role, content });
    }
    addTask(name, status) {
        this.tasks.push({ name, status });
    }
    addMcp(tool, status) {
        this.mcpInvocations.push({ tool, status });
    }
}
exports.ClawdBotPanel = ClawdBotPanel;
