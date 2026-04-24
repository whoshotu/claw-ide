// Minimal MCP registry with no direct dependency on node types
type IClawProcessService = any;
declare var require: any;
const fs = require('fs');
const path = require('path');

export class ClawdBotMCPRegistry {
  private tools: Map<string, string> = new Map();
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([k, v]) => {
          if (typeof v === 'string') this.tools.set(k, v);
        });
      }
    } catch {
      // no-op on failure
      this.tools.clear();
    }
  }

  async invokeTool(service: IClawProcessService, toolName: string, params: string[]): Promise<string> {
    if (!this.tools.has(toolName)) {
      throw new Error(`Unknown MCP tool: ${toolName}`);
    }
    const sessionId = 'clawd-mcp-' + toolName + '-' + Date.now().toString(36);
    const cmd = [toolName, ...params];
    return new Promise<string>((resolve, reject) => {
      let output = '';
      service.onStream(sessionId, (chunk) => (output += chunk));
      service.onDone(sessionId, (exitCode) => {
        if (exitCode === 0) resolve(output.trim()); else reject(new Error('MCP tool failed'));
      });
      service.onError(sessionId, (err) => reject(err));
      service.spawn(sessionId, cmd).catch(reject);
    });
  }
}
