# Claw IDE — Native Core Architecture Spec
**Tide Pool (forked from Codex) + Claw Code + Clawd Bot**
Version 1.3 | April 21, 2026

---

## Vision

Claw IDE is a fork of Tide Pool (itself a fork of Codex) where the AI intelligence layer is not an extension — it is the IDE itself. Claw Code is the foreground intelligence core. Clawd Bot is the background agent and worker core. Both are compiled into the product as native workbench contributions and are active from boot.

---

## Locked Decisions

- Base: Tide Pool (forked from Codex) — Electron + Codex workbench
- Intelligence core: Claw Code — native workbench contribution
- Agent core: Clawd Bot — native workbench contribution
- Shared process layer: clawProcess — platform service, sole subprocess entry point
- Binary: `claude` CLI (Claude Code) — runs as subprocess, never called directly from UI
- Extensions: third-party extensions via Open VSX (open-vsx.org) only — Claw Code and Clawd Bot are NOT extensions
- Distribution: free, open source, GitHub Releases
- Platforms: Ubuntu Linux first → macOS second → Windows third

---

## Out of Scope (v1)

- Custom extension marketplace (use Open VSX for third-party extensions)
- Cloud sync
- Multi-user collaboration
- Remote execution
- Custom extension host changes
- Built-in debugger (use Codex's built-in debug adapter as-is)
- Shared Claw Code + Clawd Bot session store (each has its own store in v1)

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Tide Pool (Claw IDE)               │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │           CLAW CODE CORE                 │   │
│  │  src/vs/workbench/contrib/clawCode/      │   │
│  │  - Completions provider                  │   │
│  │  - Inline diff system                    │   │
│  │  - Chat panel                            │   │
│  │  - Context collector                     │   │
│  │  - Code lens (Fix/Explain/Test)          │   │
│  │  - Consumes IClawProcessService only     │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │           CLAWD BOT CORE                 │   │
│  │  src/vs/workbench/contrib/clawdBot/      │   │
│  │  - Background worker thread              │   │
│  │  - MCP tool registry                     │   │
│  │  - Own memory/session store              │   │
│  │  - Task queue                            │   │
│  │  - IDE lifecycle event listener          │   │
│  │  - Consumes IClawProcessService only     │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │      CLAW PROCESS PLATFORM SERVICE       │   │
│  │  src/vs/platform/clawProcess/            │   │
│  │  - IClawProcessService interface         │   │
│  │  - claude binary detection               │   │
│  │  - Subprocess lifecycle manager          │   │
│  │  - Stream multiplexer (by session ID)    │   │
│  │  - Version handshake                     │   │
│  │  - SOLE entry point to claude subprocess │   │
│  └──────────────────────────────────────────┘   │
│                       │                         │
│               claude subprocess                 │
│          (`claude` CLI — runs as child)         │
└─────────────────────────────────────────────────┘
```

---

## Service Interface Rule

Both Claw Code and Clawd Bot MUST consume the subprocess through `IClawProcessService` only.
Neither core may spawn `claude` directly. This enforces:
- Single lifecycle manager
- Centralized error handling and recovery
- Clean stream multiplexing by session ID
- One version handshake on boot (not per-core)

---

## Directory Structure

```
tide-pool/
├── product.json                              ← rebrand to Claw IDE
├── src/
│   └── vs/
│       ├── platform/
│       │   └── clawProcess/                  ← shared claude process platform
│       │       ├── common/
│       │       │   ├── clawProcess.ts        ← IClawProcessService interface
│       │       │   └── clawVersion.ts        ← MIN_VERSION constant + handshake
│       │       ├── node/
│       │       │   ├── clawProcessService.ts ← subprocess spawn + stream
│       │       │   └── clawBinaryResolver.ts ← PATH + config resolution
│       │       └── electron-main/
│       │           └── clawProcessMain.ts    ← main process registration
│       └── workbench/
│           └── contrib/
│               ├── clawCode/                 ← intelligence core
│               │   ├── browser/
│               │   │   ├── clawCodeContribution.ts
│               │   │   ├── clawChatPanel.ts
│               │   │   ├── clawCompletions.ts
│               │   │   ├── clawDiffView.ts
│               │   │   ├── clawCodeLens.ts
│               │   │   └── clawContextCollector.ts
│               │   └── common/
│               │       ├── clawCodeEvents.ts ← event names (locked)
│               │       └── clawCodeSession.ts← Claw Code own session store
│               └── clawdBot/                 ← agent core (OpenClaw)
│                   ├── browser/
│                   │   ├── clawdBotContribution.ts
│                   │   ├── clawdBotPanel.ts
│                   │   ├── clawdBotStatusBar.ts
│                   │   └── clawdBotTaskQueue.ts
│                   ├── common/
│                   │   ├── clawdBotEvents.ts ← event names (locked)
│                   │   └── clawdBotMemory.ts ← Clawd Bot own session store
│                   └── node/
│                       ├── clawdBotWorker.ts
│                       └── clawdBotMCPRegistry.ts
```

---

## Session Store Separation

| Store | Owner | Location | Format |
|---|---|---|---|
| Claw Code session | clawCode only | `~/.local/share/claw-ide/clawcode-sessions/` | JSONL |
| Clawd Bot memory | clawdBot only | `~/.local/share/claw-ide/clawdbot-memory/` | JSONL |

Neither core reads or writes the other's store in v1.

---

## Auto-Update System

### Layer 1 — Tide Pool IDE Shell
- Package: `electron-updater` wired to GitHub Releases
- Check on boot + manual check via Help menu
- Downloads in background, prompts user to restart
- Channel: stable (default) or nightly (opt-in)

### Layer 2 — claude CLI (Claw Code brain)
- On boot: run version handshake, compare against latest known version
- If update available: show non-blocking status bar notification
- `claw.checkClaudeUpdates` command runs `claude update`
- `claw.autoUpdateClaude` setting (default: false — opt-in only)

### Layer 3 — Clawd Bot / OpenClaw (compiled in)
- Ships WITH the IDE — no separate updater
- Updates automatically when Claw IDE updates
- No separate release cycle needed in v1

### Update Settings
```json
{
  "claw.autoUpdate": true,
  "claw.autoUpdateChannel": "stable",
  "claw.checkClaudeUpdatesOnBoot": true,
  "claw.autoUpdateClaude": false
}
```

### Update UX Flow
```
Boot → check GitHub Releases (background)
     → check claude CLI version (background)
          │
          ├── IDE update found → status bar: "Update available"
          │   click → download → "Restart to update" prompt
          │
          └── claude update found → toast: "Claude vX.X available"
              click → runs `claude update` → confirms new version
```

---

## Locked Event Contract

### Claw Code Events
```
claw-stream        ← token chunk arriving from claude subprocess
claw-done          ← response complete, subprocess exited cleanly
claw-error         ← subprocess error or non-zero exit code
claw-cancelled     ← cancelled by user or timeout
claw-diff-ready    ← diff ready for accept/reject
claw-diff-accepted ← user accepted diff
claw-diff-rejected ← user rejected diff
```

### Clawd Bot Events
```
clawd-task-start   ← background task started
clawd-task-done    ← background task completed
clawd-task-error   ← background task failed
clawd-task-cancel  ← background task cancelled
clawd-mcp-invoke   ← MCP tool invoked
clawd-mcp-result   ← MCP tool returned result
clawd-memory-save  ← session memory written to disk
clawd-memory-load  ← session memory loaded from disk
```

### Locked Command Names
```
claw.openChat           ← open Claw Code chat panel
claw.runPrompt          ← send prompt to claude
claw.cancelPrompt       ← cancel in-progress prompt
claw.checkBinary        ← verify claude binary + version
claw.acceptDiff         ← accept pending diff
claw.rejectDiff         ← reject pending diff
claw.checkClaudeUpdates ← run claude update check
clawd.openBot           ← open Clawd Bot panel
clawd.runTask           ← queue a background task
clawd.cancelTask        ← cancel running task
clawd.listMCPTools      ← list registered MCP tools
clawd.clearMemory       ← clear session memory
```

---

## Locked Settings Schema

```json
{
  "claw.binaryPath": "",
  "claw.permissionMode": "auto",
  "claw.minVersion": "1.0.0",
  "claw.streamTimeout": 30000,
  "claw.autoUpdate": true,
  "claw.autoUpdateChannel": "stable",
  "claw.checkClaudeUpdatesOnBoot": true,
  "claw.autoUpdateClaude": false,
  "clawd.enabled": true,
  "clawd.workerAutoStart": true,
  "clawd.mcpConfigPath": "~/.config/claw-ide/mcp.json",
  "clawd.memoryPath": "~/.local/share/claw-ide/clawdbot-memory/",
  "clawd.taskTimeout": 120000,
  "clawd.statusBarEnabled": true
}
```

---

## Binary Resolution Order

```
1. settings: claw.binaryPath (user override)
2. PATH lookup: `which claude` (Linux/macOS) / `where claude` (Windows)
3. First-launch setup dialog → user locates binary manually
```

Note: On Windows, npm installs `claude` as `claude.cmd`. Binary resolver must check for both.

---

## Boot Sequence

```
1. Tide Pool main process starts
2. clawProcessMain registers IClawProcessService (electron-main)
3. Binary resolution runs → locate claude on PATH or config
4. Version handshake runs → validate claude semver
5. Workbench loads
6. clawCodeContribution registers (IClawProcessService injected)
7. clawdBotContribution registers (IClawProcessService injected)
8. Editor ready — both cores active
```

---

## Phase Implementation Plan

### Phase 0 — Strip + Scaffold + Compile
Remove OpenAI/Codex AI contributions, scaffold directories, create stubs, compile as Claw IDE.
Exit: IDE compiles clean, launches as Claw IDE, no OpenAI references remain.

### Phase 1 — clawProcess Platform Service
Build IClawProcessService — binary resolution, version handshake, subprocess lifecycle, stream multiplexer.
Exit: claw.checkBinary works; version handshake verified on boot.

### Phase 2 — Claw Code Core
Build completions, chat panel, diff view, code lens. All via IClawProcessService.
Exit: Chat works, completions appear, diffs show, code lens active.

### Phase 3 — Clawd Bot Core (OpenClaw)
Build background worker, MCP registry, memory store, status bar.
Exit: Bot starts on boot, tasks run, MCP tools invoke, memory persists.

### Phase 4 — Polish + Auto-Update + Release
Build auto-updater for all 3 layers, onboarding wizard, rebrand, release binaries.
Exit: .deb/.AppImage build on Ubuntu, auto-update wired, onboarding works.

---

## Validation Gates

| Phase | Gate Criteria |
|---|---|
| P0 | Compiles clean, launches as Claw IDE, no OpenAI references, stubs registered |
| P1 | Binary found, version handshake passes, subprocess streams events correctly |
| P2 | Chat works, completions appear, diffs show, code lens active |
| P3 | Bot starts on boot, tasks run, MCP tools invoke, memory persists |
| P4 | .deb/.AppImage builds, auto-update wired, onboarding works, branding complete |

---

## Error Handling Policy

| Failure | Response |
|---|---|
| claude binary not found | First-launch setup dialog — do not block IDE boot |
| claude below min version | Block with modal + upgrade link |
| claude crashes mid-stream | Show [Response interrupted], re-enable input |
| claude hangs > 30s | Auto-kill SIGTERM then SIGKILL, emit claw-error |
| MCP tool fails | Log inline in Clawd Bot panel, continue queue |
| Clawd Bot memory corrupted | Reset memory, warn user, continue |
| Worker thread crashes | Restart once; if again set status bar to error |
| IDE update download fails | Silent retry next boot |

---

## Security Policy

- No `shell: true` in subprocess config — ever
- No hardcoded API keys or secrets
- File write operations scoped to user-selected or config-defined paths only
- Logs must not contain raw user code beyond file paths
- MCP tools must declare permissions before invocation
- IClawProcessService is the only permitted subprocess entry point

---

## Post-MVP Backlog (v2+)

- Shared session context between Claw Code and Clawd Bot (opt-in)
- Visual git diff view integrated with Claw Code diffs
- Clawd Bot scheduled/cron-style triggers
- Custom MCP tool builder UI
- Claw IDE theme pack
- Remote workspace support
- Multi-session Claw Code (parallel claude contexts)
- Nightly update channel
