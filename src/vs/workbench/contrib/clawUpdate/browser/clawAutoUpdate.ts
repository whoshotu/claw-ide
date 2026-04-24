// Auto-update Layer 1 (IDE shell) — P4
declare var require: any;
export class ClawAutoUpdate {
  constructor(private channel: string = 'stable', private enabled: boolean = true) {}
  init() {
    if (!this.enabled) return;
    try {
      const updaterModule = require('electron-updater');
      const updater = updaterModule?.autoUpdater ?? null;
      if (updater) {
        updater.on?.('update-available', () => {
          (globalThis as any).clawUpdateStatus = 'update-available';
        });
        updater.checkForUpdatesAndNotify?.();
        (globalThis as any).clawUpdateStatus = 'checking';
      }
    } catch {
      // electron-updater not available in this build; no-op
    }
  }
}
