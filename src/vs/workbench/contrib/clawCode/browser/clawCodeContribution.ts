// Registration of Claw Code contributions (P2)
import { ClawCodeLensProvider } from './clawCodeLens';
import { ClawChatPanel } from './clawChatPanel';
import { ClawCompletionsProvider } from './clawCompletions';
type IClawProcessService = any;

// Lightweight registrations for build; actual VSCode extension APIs are not wired here.
export function registerClawCodeContributions(_service: IClawProcessService) {
  // Chat panel
  const chat = new ClawChatPanel(_service as any);
  (globalThis as any).clawCodeChatPanel = chat;

  // Completions
  // Proxy provider since there is no real editor integration in this scaffold
  const completions = new ClawCompletionsProvider(_service as any);
  (globalThis as any).clawCodeCompletions = completions;

  // Diff view
  (globalThis as any).clawDiffView = {};

  // CodeLens
  (globalThis as any).clawCodeLensProvider = new ClawCodeLensProvider();
}
