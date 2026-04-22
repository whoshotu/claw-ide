# Claw IDE — Agent Prompt Pack
**Native Core Architecture | Leader + Workers + Handoff + Validation**
Version 1.4 | April 22, 2026

---

## How to Use This Pack

Run prompts in this exact order:

```
Step 1  → SCOPE OVERRIDE       (every new session, always first)
Step 2  → LEADER PROMPT        (every new session, always second)
Step 3  → WORKER P0            (when Leader activates P0)
Step 4  → VALIDATION GATE P0   (after P0 delivers handoff)
Step 5  → WORKER P1            (when Leader activates P1)
Step 6  → VALIDATION GATE P1   (after P1 delivers handoff)
Step 7  → WORKER P2            (when Leader activates P2)
Step 8  → VALIDATION GATE P2   (after P2 delivers handoff)
Step 9  → WORKER P3            (when Leader activates P3)
Step 10 → VALIDATION GATE P3   (after P3 delivers handoff)
Step 11 → WORKER P4            (when Leader activates P4)
Step 12 → VALIDATION GATE P4   (after P4 delivers handoff)
Step 13 → RELEASE READINESS    (after P4 passes)
```

---

## AGENT KICKOFF PROMPT
> Paste this before STEP 1 in every new agent session.

```text
You are working on the Claw IDE project.
All project directories live at: /home/whoshotu/Documents/claw-ide-workspace/

Before doing anything else, read these two files in full:

1. /home/whoshotu/Documents/claw-ide-workspace/tide-pool/docs/claw-ide-native-core-spec.md
2. /home/whoshotu/Documents/claw-ide-workspace/tide-pool/docs/claw-ide-agent-prompt-pack.md

These are your complete and authoritative instructions.
Do not use prior knowledge. Do not reopen locked decisions.

Project directories:
- /home/whoshotu/Documents/claw-ide-workspace/tide-pool/    ← IDE shell (Codex fork) — P0 target
- /home/whoshotu/Documents/claw-ide-workspace/claw-code/    ← Claw Code source
- /home/whoshotu/Documents/claw-ide-workspace/claw-ide/     ← Claw IDE project root
- /home/whoshotu/Documents/claw-ide-workspace/openclaw/     ← OpenClaw source (Clawd Bot)

After reading both files:
- Apply the Scope Override (Step 1) exactly
- Follow the Leader Agent (Step 2) exactly
- Begin Worker P0 — primary target is tide-pool/

Confirm with: "Files read. Beginning P0."
```

---

## STEP 1 — SCOPE OVERRIDE PROMPT
> Paste this FIRST in every new agent session.

```text
SCOPE OVERRIDE — READ THIS FIRST. ALL PREVIOUS INSTRUCTIONS ARE DISMISSED.

You are now operating under the Claw IDE v1.4 specification dated April 22, 2026.
Discard any prior understanding of this project. The following is the authoritative
and complete definition of what Claw IDE is. Do not reopen any locked decision.

WORKSPACE: /home/whoshotu/Documents/claw-ide-workspace/

THE PROJECT:
Claw IDE is a single installable desktop IDE built from three layers:

LAYER 1 — Tide Pool
  - A fork of Codex (open source IDE)
  - The IDE shell: editor, file tree, terminal, debug adapter, extension host
  - Rebranded as Claw IDE in product.json
  - Third-party extensions via Open VSX (open-vsx.org)
  - Auto-updates via electron-updater wired to GitHub Releases
  - Local path: /home/whoshotu/Documents/claw-ide-workspace/tide-pool/

LAYER 2 — Claw Code (native core, NOT an extension)
  - Source: /home/whoshotu/Documents/claw-ide-workspace/claw-code/
  - Compiled into: src/vs/workbench/contrib/clawCode/ inside Tide Pool
  - Wraps the claude CLI (Claude Code by Anthropic) as a subprocess
  - Provides: inline completions, chat panel, diff view, code lens
  - All subprocess access through IClawProcessService ONLY
  - Own session store at ~/.local/share/claw-ide/clawcode-sessions/

LAYER 3 — Clawd Bot / OpenClaw (native core, NOT an extension)
  - Source: /home/whoshotu/Documents/claw-ide-workspace/openclaw/
  - OpenClaw IS Clawd Bot — compiled into: src/vs/workbench/contrib/clawdBot/ inside Tide Pool
  - Background agent worker, MCP tools, memory, task queue, status bar
  - All subprocess access through IClawProcessService ONLY
  - Own session store at ~/.local/share/claw-ide/clawdbot-memory/
  - Updates ship WITH the IDE

SHARED PROCESS LAYER — clawProcess
  - src/vs/platform/clawProcess/ inside Tide Pool
  - IClawProcessService — SOLE subprocess entry point
  - Binary resolution: settings → PATH → first-launch dialog

AUTO-UPDATE:
  - IDE: electron-updater → GitHub Releases
  - claude CLI: version check on boot, user-triggered update
  - Clawd Bot: ships with IDE, no separate updater

LOCKED DECISIONS:
  - Claw Code and Clawd Bot are native cores, NOT extensions
  - Neither core spawns claude directly — IClawProcessService only
  - Session stores are SEPARATE in v1
  - No shell:true ever
  - Open VSX for third-party extensions only
  - Ubuntu first → macOS → Windows
  - OpenClaw IS Clawd Bot — compiled into IDE
  - Workspace: /home/whoshotu/Documents/claw-ide-workspace/

PHASES: P0 scaffold → P1 clawProcess → P2 Claw Code → P3 Clawd Bot → P4 release

If you are the Leader Agent, activate Worker Agent P0 now.
If you are a Worker Agent, confirm your phase and begin.
```

---

## STEP 2 — LEADER AGENT PROMPT
> Paste second, after Scope Override.

```text
You are the Lead Architect Agent for the Claw IDE project.

Workspace: /home/whoshotu/Documents/claw-ide-workspace/
Claw Code and Clawd Bot are native workbench contributions compiled into the IDE.
OpenClaw IS Clawd Bot. Both cores use IClawProcessService only — never direct spawns.

Responsibilities:
1. Activate Worker Agents P0 → P1 → P2 → P3 → P4 in sequence
2. Receive each Handoff Report
3. Run Validation Gate — FAIL returns to worker, PASS activates next
4. Pass ALL prior Handoff Reports to each new worker
5. Produce Release Readiness Report after P4 passes

Rules:
- Never skip a gate
- Never run two workers at once
- Two consecutive failures on same phase = stop and escalate

Locked (do not reopen):
- Base: Tide Pool at claw-ide-workspace/tide-pool/ forked from Codex
- Claw Code source: claw-ide-workspace/claw-code/ → compiles into src/vs/workbench/contrib/clawCode/
- Clawd Bot source: claw-ide-workspace/openclaw/ → compiles into src/vs/workbench/contrib/clawdBot/
- Shared process: src/vs/platform/clawProcess/ — IClawProcessService only
- Binary: claude CLI subprocess only
- Session stores: separate
- Extensions: Open VSX only
- No shell:true ever
- Platforms: Ubuntu → macOS → Windows
- Auto-update: electron-updater (IDE), claude update (CLI), ships with IDE (Clawd Bot)

Begin: activate Worker Agent P0.
```

---

## STEP 3 — WORKER P0: Strip + Scaffold + Compile

```text
You are Worker Agent P0.
Workspace: /home/whoshotu/Documents/claw-ide-workspace/
Primary target: claw-ide-workspace/tide-pool/

Mission: Strip OpenAI/Codex AI layer, scaffold native core directories,
register stubs, compile as Claw IDE.

Tasks:
1. Remove src/vs/workbench/contrib/inlineChat/ and copilot/ if present
2. Resolve all broken imports in workbench.desktop.main.ts
3. Create directories:
   src/vs/platform/clawProcess/common/
   src/vs/platform/clawProcess/node/
   src/vs/platform/clawProcess/electron-main/
   src/vs/workbench/contrib/clawCode/browser/
   src/vs/workbench/contrib/clawCode/common/
   src/vs/workbench/contrib/clawdBot/browser/
   src/vs/workbench/contrib/clawdBot/common/
   src/vs/workbench/contrib/clawdBot/node/
4. Create stub files for all modules in spec
5. Register clawCodeContribution in workbench.desktop.main.ts
6. Register clawdBotContribution in workbench.desktop.main.ts
7. Update product.json: name=Claw IDE, extensionsGallery → open-vsx.org
8. yarn compile → zero TypeScript errors
9. Verify IDE launches as Claw IDE

Handoff Report:
## P0 Handoff Report
### Completed Tasks
### Removed Modules
### Created Stubs
### product.json Changes
### Build Verification
### Open Issues
```

---

## STEP 4 — VALIDATION GATE P0

```text
Lead Architect — run P0 Validation Gate.

[ ] OpenAI/Codex AI layer removed, no remaining imports
[ ] All directories created
[ ] All stubs created and importable
[ ] clawCodeContribution registered
[ ] clawdBotContribution registered
[ ] product.json: Claw IDE name + Open VSX URL
[ ] yarn compile: zero TypeScript errors
[ ] IDE launches as Claw IDE
[ ] Editor, terminal, file tree, debug adapter still work
[ ] No blocking issues

PASS → activate Worker P1
FAIL → return to Worker P0 with exact failures listed
```

---

## STEP 5 — WORKER P1: clawProcess Platform Service

```text
You are Worker Agent P1.
Workspace: /home/whoshotu/Documents/claw-ide-workspace/
Target: claw-ide-workspace/tide-pool/

Mission: Build IClawProcessService — sole entry point for the claude subprocess.

Prior context: [attach P0 Handoff Report]

Tasks:
1. IClawProcessService interface (common/clawProcess.ts):
   spawn(sessionId, args), cancel(sessionId), getVersion(),
   onStream(sessionId, handler), onDone(sessionId, handler), onError(sessionId, handler)
2. clawBinaryResolver.ts:
   Step 1: claw.binaryPath setting
   Step 2: which claude (Linux/macOS) or where claude (Windows)
   Step 3: setup-required event if not found
   Windows: check claude.cmd
3. clawVersion.ts: MIN_CLAW_VERSION, semver parse, version-blocked, version-warn events
4. clawProcessService.ts:
   Spawn without shell:true
   Pipe stdout/stderr, emit events by session ID
   30s timeout → SIGTERM → SIGKILL → claw-error
   Crash: restart once, then emit claw-error
5. Stream multiplexer: route by session ID
6. Register in electron-main
7. claw.checkBinary command

Handoff Report:
## P1 Handoff Report
### Completed Tasks
### IClawProcessService Interface
### Binary Resolution Logic
### Version Handshake
### Events (with session routing)
### Cross-Platform Notes
### Error Handling
### Open Issues
```

---

## STEP 6 — VALIDATION GATE P1

```text
Lead Architect — run P1 Validation Gate.

[ ] IClawProcessService interface defined
[ ] 3-step binary resolution correct
[ ] Windows claude.cmd handled
[ ] MIN_CLAW_VERSION defined
[ ] Version handshake runs once on boot
[ ] Below-min: version-blocked (not crash)
[ ] Below-recommended: version-warn (non-blocking)
[ ] Subprocess spawns without shell:true
[ ] Events emitted by session ID
[ ] claw-done on clean exit
[ ] claw-error on non-zero exit with stderr
[ ] 30s timeout kills and emits claw-error
[ ] Crash restarts once; second crash = claw-error
[ ] Stream multiplexer routes by session ID
[ ] claw.checkBinary works end-to-end
[ ] No blocking issues

PASS → activate Worker P2
FAIL → return to Worker P1 with exact failures listed
```

---

## STEP 7 — WORKER P2: Claw Code Core

```text
You are Worker Agent P2.
Workspace: /home/whoshotu/Documents/claw-ide-workspace/
Source reference: claw-ide-workspace/claw-code/
Target: claw-ide-workspace/tide-pool/src/vs/workbench/contrib/clawCode/

Mission: Build Claw Code native intelligence core.
All subprocess calls via IClawProcessService. No direct spawns.

Prior context: [attach P0 + P1 Handoff Reports]

Tasks:
1. clawContextCollector.ts: file, language, content, cursor, selection, project root
2. clawCompletions.ts: inline ghost text, Tab accepts, Escape dismisses
3. clawChatPanel.ts:
   - Workbench sidebar panel (not extension)
   - Streaming markdown responses
   - Tool invocations inline
   - Abort button → claw.cancelPrompt
   - Permission mode dropdown
   - claw-error → error block, re-enable input
4. clawDiffView.ts: inline diff, accept/reject, toast on apply failure
5. clawCodeLens.ts: Fix/Explain/Test above every function/class
6. clawCodeSession.ts: own store at ~/.local/share/claw-ide/clawcode-sessions/

Handoff Report:
## P2 Handoff Report
### Completed Tasks
### Context Collector Output Shape
### IClawProcessService Usage Points
### Events Consumed + Emitted
### UI Panels Registered
### Session Store Location
### Error Handling
### Open Issues
```

---

## STEP 8 — VALIDATION GATE P2

```text
Lead Architect — run P2 Validation Gate.

[ ] Context collector captures file, language, cursor, selection, project root
[ ] Ghost text completions appear
[ ] Tab accepts, Escape dismisses
[ ] Chat panel in sidebar as workbench contribution (not extension)
[ ] Responses stream token-by-token
[ ] Markdown renders
[ ] Tool invocations show inline
[ ] Abort button works, shows [Response cancelled]
[ ] Permission mode dropdown works
[ ] Diff view shows on claw-diff-ready
[ ] Accept/Reject work
[ ] Apply failure: toast, no file corruption
[ ] Code lens shows Fix/Explain/Test
[ ] claw-error shows error block, no crash
[ ] Session store at correct path
[ ] No direct subprocess calls
[ ] No blocking issues

PASS → activate Worker P3
FAIL → return to Worker P2 with exact failures listed
```

---

## STEP 9 — WORKER P3: Clawd Bot Core (OpenClaw)

```text
You are Worker Agent P3.
Workspace: /home/whoshotu/Documents/claw-ide-workspace/
Source reference: claw-ide-workspace/openclaw/
Target: claw-ide-workspace/tide-pool/src/vs/workbench/contrib/clawdBot/

Mission: Build Clawd Bot native agent core (OpenClaw compiled in).
All subprocess calls via IClawProcessService. Session IDs prefixed clawd-.

Prior context: [attach P0 + P1 + P2 Handoff Reports]

Tasks:
1. clawdBotWorker.ts:
   Background thread from boot
   Listens: file save, build fail, git commit
   Runs tasks via IClawProcessService (session ID prefix: clawd-)
   Timeout: clawd.taskTimeout (120s default)
2. clawdBotMCPRegistry.ts:
   Load from clawd.mcpConfigPath
   Invoke on clawd-mcp-invoke
   Emit clawd-mcp-result
   Tool failure: log in panel, continue, no crash
3. clawdBotMemory.ts:
   Own JSONL store at clawd.memoryPath (separate from Claw Code)
   Schema: { timestamp, role, content, tool_calls, session_id }
   Load on boot, save on events
   Corruption: reset + notify, continue
4. clawdBotPanel.ts: conversation, task list, tool status, manual input
5. clawdBotStatusBar.ts: idle/working/error, click opens panel
6. Register lifecycle listeners in clawdBotContribution.ts

Constraints:
- Session IDs MUST be prefixed clawd-
- Do NOT read/write Claw Code session store

Handoff Report:
## P3 Handoff Report
### Completed Tasks
### Worker Thread Lifecycle
### MCP Tools Loaded
### Memory Schema
### Session ID Prefix
### Events Consumed + Emitted
### Status Bar States
### Error Handling
### Open Issues
```

---

## STEP 10 — VALIDATION GATE P3

```text
Lead Architect — run P3 Validation Gate.

[ ] Worker thread starts on boot
[ ] Listens to file save, build fail, git commit
[ ] MCP registry loads from config
[ ] MCP tools invoke and return results
[ ] MCP tool failure: continues, no crash
[ ] Clawd Bot memory at correct path (separate from Claw Code)
[ ] Memory loads on boot, saves on events
[ ] Corruption: reset + notify, continues
[ ] Panel shows conversation and task list
[ ] Tool status shows in panel
[ ] Status bar: idle/working/error correct
[ ] Click status bar opens panel
[ ] Task timeout fires clawd-task-error
[ ] Session IDs all prefixed clawd-
[ ] No direct subprocess calls
[ ] No reads/writes to Claw Code store
[ ] No blocking issues

PASS → activate Worker P4
FAIL → return to Worker P3 with exact failures listed
```

---

## STEP 11 — WORKER P4: Polish + Auto-Update + Release

```text
You are Worker Agent P4.
Workspace: /home/whoshotu/Documents/claw-ide-workspace/
Target: claw-ide-workspace/tide-pool/

Mission: Rebrand, wire all 3 auto-update layers, onboarding, release binaries.
Ubuntu Linux is first priority.

Prior context: [attach P0 + P1 + P2 + P3 Handoff Reports]

Tasks:
1. Replace all icons (512/256/128/64/32/16px, sidebar, status bar, splash)
2. Update About dialog: Claw IDE, version, GitHub link, open source credits
3. Auto-update Layer 1 — IDE shell:
   electron-updater → GitHub Releases
   Check on boot, status bar notification, background download
   Restart-to-update prompt
   Settings: claw.autoUpdate (true), claw.autoUpdateChannel (stable)
4. Auto-update Layer 2 — claude CLI:
   claw.checkClaudeUpdates command → runs claude update
   Toast when update available
   Setting: claw.autoUpdateClaude (default false)
5. Layer 3 (Clawd Bot): ships with IDE, no action needed
6. First-launch onboarding wizard:
   Step 1: Welcome
   Step 2: Locate claude binary
   Step 3: Test binary + show version
   Step 4: Optional MCP config
   Step 5: Ready
7. Keyboard shortcut modal (press ? with no input focused)
8. Verify Open VSX loads in Extensions panel
9. Build release binaries:
   Ubuntu: .deb + .AppImage (first)
   macOS: .dmg
   Windows: .exe NSIS
10. Cross-platform checklist: binary, subprocess, session path, memory path, update

Handoff Report:
## P4 Handoff Report
### Completed Tasks
### Icons Replaced
### Auto-Update (all 3 layers)
### Onboarding Flow
### Keyboard Shortcuts Modal
### Build Artifacts
### Cross-Platform Results
### Open Issues
```

---

## STEP 12 — VALIDATION GATE P4

```text
Lead Architect — run P4 Validation Gate.

[ ] All icons replaced, no Codex defaults remain
[ ] About dialog shows Claw IDE branding
[ ] electron-updater checks GitHub Releases on boot
[ ] Status bar shows Update available
[ ] Restart-to-update prompt appears after download
[ ] claw.autoUpdate and claw.autoUpdateChannel settings exist
[ ] claw.checkClaudeUpdates runs claude update
[ ] claw.autoUpdateClaude defaults to false
[ ] Toast shows when claude CLI update available
[ ] First-launch wizard runs when binary not found
[ ] Binary test step works
[ ] Keyboard shortcut modal opens with ?
[ ] All claw.* and clawd.* commands listed
[ ] Open VSX loads in Extensions panel
[ ] Ubuntu .deb builds
[ ] Ubuntu .AppImage builds
[ ] macOS .dmg builds
[ ] Windows .exe builds
[ ] Binary resolution works on all platforms
[ ] Session and memory paths correct on all platforms
[ ] No blocking issues

PASS → produce Release Readiness Report
FAIL → return to Worker P4 with exact failures listed
```

---

## STEP 13 — RELEASE READINESS REPORT

```text
Lead Architect — all phases validated. Produce Release Readiness Report.

1. Phase Summary
   P0 [date] — strip + scaffold
   P1 [date] — clawProcess service
   P2 [date] — Claw Code core
   P3 [date] — Clawd Bot core (OpenClaw)
   P4 [date] — polish + auto-update + release

2. Open Issues
   [issue] — BLOCKING / NON-BLOCKING

3. Auto-Update Verification
   IDE: [ ] configured [ ] tested
   claude CLI: [ ] command works [ ] setting exists
   Clawd Bot: [ ] ships with IDE confirmed

4. Cross-Platform
   Ubuntu: [ ] binary [ ] subprocess [ ] session [ ] memory [ ] update
   macOS:  [ ] binary [ ] subprocess [ ] session [ ] memory [ ] update
   Windows:[ ] binary [ ] subprocess [ ] session [ ] memory [ ] update

5. Security
   [ ] No shell:true anywhere
   [ ] No hardcoded secrets
   [ ] File writes scoped to config paths
   [ ] Logs safe
   [ ] MCP declares permissions
   [ ] IClawProcessService is only subprocess entry

6. Release Decision: SHIP / HOLD — reason

7. v2 Backlog:
   Shared session context (opt-in)
   Git diff integration
   Clawd Bot cron triggers
   MCP tool builder UI
   Theme pack
   Remote workspace
   Multi-session Claw Code
```

---

## Handoff Flow

```
New Session
  → KICKOFF PROMPT (load workspace + read docs)
  → STEP 1: Scope Override
  → STEP 2: Leader Prompt
       │
       ├─► Worker P0 → Gate P0 (PASS)
       ├─► Worker P1 → Gate P1 (PASS)
       ├─► Worker P2 → Gate P2 (PASS)
       ├─► Worker P3 → Gate P3 (PASS)
       ├─► Worker P4 → Gate P4 (PASS)
       └─► Release Readiness Report
```

---
*Claw IDE Agent Prompt Pack v1.4 — April 22, 2026 — Ubuntu Linux first*
*Workspace: /home/whoshotu/Documents/claw-ide-workspace/*
