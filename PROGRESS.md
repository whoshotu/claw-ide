# Claw IDE Progress

## Current release

**Version:** 1.1.15

The app is a Tauri 2.x + React + Monaco desktop IDE with local file editing,
agent-assisted changes, provider settings, terminal access, and a lightweight
VS Code-style workbench.

## Completed phases

### Phase 1: Core workbench ✅

- Activity bar views for Explorer, Search, Source Control, Run, and Extensions.
- Command palette with `Ctrl+Shift+P` / `Cmd+Shift+P`.
- Empty-on-start Explorer with local folder selection and new-folder creation.

### Phase 2: Editor workbench ✅

- Monaco editing with dirty-file tracking.
- Save, Save All, close-active-editor, and dirty-close confirmation.
- Local file reads and writes through Tauri commands.
- Review-first agent edit proposals with Apply and Reject actions.

### Phase 3: Developer tools ✅

- Run view with frontend build/typecheck, Rust check, and test commands.
- Basic Python `pdb` and JavaScript Node inspector launchers.
- Integrated local terminal for interactive commands.
- Version bumped to 1.1.5 after the internet provider, trusted-host, File menu,
  and editor zoom updates.

### Phase 4: Search and navigation ✅

- Recursive workspace text search from the Search activity view.
- Optional filename filtering.
- Search results include file path, line number, and matching text.
- Clicking a result opens the file in Monaco.
- Search skips hidden and generated dependency/build directories.
- Search is capped at 500 results to keep the UI responsive.

## Validation status

The following checks currently pass:

```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

`npm test -- --run` executes correctly but currently reports that no test files
are present.

## Known limitations

- Debug launchers are basic process commands, not full breakpoint/variable
  debugging.
- Run tasks and terminal commands use one-shot Tauri execution; persistent
  streaming process sessions are not implemented yet.
- Extensions are still a view placeholder. Source Control now shows Git status
  and a diff summary.
- Search is literal text search rather than regular-expression or symbol search.
- Search results open the file but do not yet scroll Monaco directly to the
  matched line.

## Next phase

### Phase 5: Persistent developer sessions 🚧

- Persistent terminal and debug processes with streaming output and Stop controls.
- Existing one-shot checks remain available for build/typecheck/test commands.
- Structured compiler diagnostics and source-control integration remain planned.
- Search result line-targeted navigation remains planned.

### Phase 6: Workbench architecture correction 🚧

- Left activity-bar views are independent from the right Chat panel.
- Chat remains visible on the right while Explorer, Search, Run, Source Control,
  and Extensions change on the left.
- Settings open from the top menu in a modal instead of taking over a sidebar.
- Chat exposes API Provider, ClawCode runtime, and ClawBot/OpenClaw runtime
  choices with explicit availability status.
- Full conversational bridges for the ClawCode CLI and OpenClaw gateway remain
  planned; the UI does not pretend those bridges exist.

## Integration boundary

ClawCode and ClawBot/OpenClaw are still part of the project. ClawCode is
represented by the local `claw` runtime discovery command, while ClawBot is
represented by the local `openclaw` gateway discovery command. Their binaries
can still be launched through the terminal and existing backend commands.
Direct conversational transport into the Chat panel is the remaining
integration task.

### Phase 7: Agent workbench and source control ✅

- Source Control shows the current Git branch, changed files, and diff summary.
- Git actions are read-only for safety; staging and commits remain planned.
- Agent context still includes the active file and workspace. Diagnostics,
  search results, Git diffs, and multi-file proposals are the next context
  expansion.

### Phase 8: Agent safety and UI/UX 🚧

- Raw `<dots_function_call>` tool markup is no longer displayed as chat content.
- Model-requested terminal commands appear as explicit approval cards.
- Commands run only after the user chooses **Allow once**.
- Chat now has a clearer header, agent status, empty state, message hierarchy,
  tool-result styling, and clear action.
- Full provider-native tool schemas and multi-step tool continuation remain
  planned; the current safety layer handles the XML tool format defensively.

### Phase 9: Agent harness foundation ✅

- Startup agent-team health check is wired into Tauri initialization.
- Chat shows ClawCode, ClawBot, and API-backup availability.
- The API provider is selected as a visible degraded-mode backup when local
  runtimes are unavailable.
- ClawCode is actively probed with `claw --version` and is reported ready when
  its supported CLI adapter is available.
- Runtime discovery checks common user install locations as well as PATH, so
  startup health is consistent when Claw IDE is launched from the desktop.
- OpenClaw startup is self-managed: Claw IDE starts and verifies the local
  gateway when the installed runtime is not already running.
- The Chat panel includes a manual health refresh action.
- OpenClaw is marked ready only when `openclaw gateway status` exits successfully;
  an installed but unhealthy gateway is shown as degraded.
- ClawCode does not run as a persistent ACP daemon because its documented ACP
  command is still a status alias; selected messages start one-shot CLI runs.

### Phase 10: Protocol adapters and coordination boundary 🚧

- ClawCode now routes through its supported JSON one-shot prompt surface.
- OpenClaw now routes through the documented `openclaw acp` stdio bridge.
- The Chat panel sends selected non-provider requests through the corresponding
  adapter and reports adapter failures explicitly.
- Dynamic role handoffs, shared multi-agent task state, and automatic runtime
  process supervision remain planned for when those protocols are available.

Version 1.1.15 records completion of the adapter routing milestone, the
OpenClaw ACP stream parsing fix. Dynamic
role handoffs remain gated on supported runtime contracts.

### Phase 11: Provider environment and verification 🚧

- Settings detects supported terminal environment variables without exposing
  secret values.
- User-confirmed environment import writes provider credentials through the
  existing local settings path.
- Provider choices include OpenRouter, OpenAI, OpenAI-compatible,
  Anthropic-compatible, Gemini-compatible, xAI-compatible, DeepSeek-compatible,
  and Ollama.
- A live verification action reports real connection status and latency.
