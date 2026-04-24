// Simple Clawd Bot panel (P3) – conversation, tasks, and MCP status
export class ClawdBotPanel {
  private history: Array<{ role: string; content: string }> = [];
  private tasks: Array<{ name: string; status: string }> = [];
  private mcpInvocations: Array<{ tool: string; status: string }> = [];

  open() {
    // placeholder show panel
  }

  addMessage(role: string, content: string) {
    this.history.push({ role, content });
  }

  addTask(name: string, status: string) {
    this.tasks.push({ name, status });
  }

  addMcp(tool: string, status: string) {
    this.mcpInvocations.push({ tool, status });
  }
}
