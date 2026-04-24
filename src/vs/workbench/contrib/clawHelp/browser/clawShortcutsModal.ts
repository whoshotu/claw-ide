// Shortcuts modal (P4)
export class ClawShortcutsModal {
  open() {
    // Placeholder UI: would render a modal listing commands
  }
  listCommands(): string[] {
    return [
      'claw.checkBinary',
      'claw.autoUpdate',
      'claw.stats',
      'clawd.*'
    ];
  }
}
