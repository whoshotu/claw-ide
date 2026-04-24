// Electron main entry (P1): register ClawProcessService singleton and wire binary resolver
import { ClawProcessService } from "../node/clawProcessService";
import { resolveClaudeBinary } from "../node/clawBinaryResolver";

export function registerClawProcessMain() {
  // Simple singleton registration on global for this scaffold
  const service = new ClawProcessService();
  (globalThis as any).clawProcessService = service;

  // Wire a simple command surface to check Claude binary availability
  (globalThis as any).checkClaudeBinary = async (): Promise<string | null> => {
    try {
      const path = await resolveClaudeBinary();
      return path;
    } catch {
      return null;
    }
  };
}
