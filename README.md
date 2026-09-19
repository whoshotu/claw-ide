npm# Claw IDE

A Tauri 2.x + React + Monaco Editor desktop IDE that wraps the `claw` CLI.

## Features

- **Monaco Editor** — VS Code's editor with syntax highlighting, find/replace, code folding
- **File Tree** — Browse project files with expand/collapse directories
- **Workspace Explorer** — Start with an empty explorer, then open a local folder with `+ Folder` or create a new folder
- **AI Chat Panel** — Interact with the claw CLI directly from the IDE
- **Local Terminal** — Run commands in the selected workspace and view stdout, stderr, and exit codes
- **Agent Editing** — Give the agent the active file and workspace context; review proposed edits before applying them
- **Run and Debug Checks** — Run frontend typechecks, Rust checks, tests, and basic Python/JavaScript debug launchers from the left workbench
- **Persistent Processes** — Run terminal and debug commands with streaming output and Stop controls
- **Workspace Search** — Search text recursively across the opened folder, filter by filename, and open matches at the corresponding file
- **Persistent Agent Panel** — Keep Chat visible on the right while left-side workbench tools change independently
- **ClawCode and ClawBot Hooks** — Detect the local `claw` runtime and OpenClaw gateway from the Chat agent selector
- **Git Source Control** — View the current branch, changed files, and diff summary for the opened workspace
- **Tool Approval UI** — Review model-requested terminal commands before Claw IDE runs them
- **Agent Team Health** — Check ClawCode, ClawBot, and API-backup availability at startup
- **Multiple AI Providers** — Ollama, OpenAI, OpenRouter, and OpenAI-compatible APIs with configurable base URLs and API keys
- **Persistent Settings** — Provider, model, permission mode, API URL, and API key settings persist between launches
- **Session Management** — Chat history persists across sessions

## Prerequisites

- Node.js 20+
- Rust 1.70+
- claw CLI (optional — will prompt if not found)

## Setup

```bash
# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

The packaged installers are written to `src-tauri/target/release/bundle/`. On Linux,
the build produces a `.deb` package and may produce an AppImage bundle depending on
the installed Tauri bundling tools.

## Configuration

The app stores provider settings in the platform configuration directory:

- Linux: `~/.config/claw-ide/settings.json`
- macOS: `~/Library/Application Support/claw-ide/settings.json`
- Windows: `%APPDATA%\\claw-ide\\settings.json`

For claw CLI configuration, create `~/.config/claw-ide/config.toml`:

```toml
[claw]
binary_path = "/path/to/claw"  # optional, PATH fallback
default_model = "opus"          # opus, sonnet, haiku
default_permission = "workspace-write"  # read-only, workspace-write

[editor]
font_size = 14
theme = "dark"
```

## Project Structure

```
claw-ide/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── FileTree.tsx
│   │   ├── EditorPanel.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── TerminalPanel.tsx
│   │   ├── SearchPanel.tsx
│   │   └── StatusBar.tsx
│   ├── store/             # Zustand state
│   │   └── appStore.ts
│   ├── App.tsx            # Main layout
│   └── main.tsx           # Entry point
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs       # Binary entry
│   │   ├── lib.rs       # App setup + logging
│   │   └── commands.rs  # Tauri commands
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── README.md
```

## Using the Local Terminal

1. Start the app and open a folder with **+ Folder** in the Explorer.
2. Select **View → Terminal**.
3. Enter a command and press **Run** or Enter.

Commands run through the operating system shell with the selected folder as the
working directory. The terminal is local to the desktop app; it does not execute
commands on a remote server.

## Updating an Installed App

The development source directory and the installed desktop app are separate. After
making source changes, build a new package and install it over the existing version.

### Linux Debian/Ubuntu

```bash
cd /path/to/claw-ide
npm install
npm run tauri build
sudo apt install ./src-tauri/target/release/bundle/deb/Claw\ IDE_1.1.15_amd64.deb
```

Close Claw IDE before installing the replacement. Your settings are stored outside
the application bundle, so reinstalling should preserve them. If the old app is
still open, quit it first and then launch the newly installed version from the
application menu.

### Linux AppImage

```bash
cd /path/to/claw-ide
npm run tauri build
chmod +x "src-tauri/target/release/bundle/appimage/Claw IDE.AppImage"
./"src-tauri/target/release/bundle/appimage/Claw IDE.AppImage"
```

An AppImage is portable and does not replace a separately installed `.deb`; use
the new AppImage directly or replace the old AppImage file.

### Runtime verification commands

After installing the runtimes, verify the app-managed startup prerequisites:

```bash
command -v claw
claw --version
command -v openclaw
openclaw gateway status
```

Build and install the current Claw IDE release:

```bash
cd /home/whoshotu/Documents/claw-ide-workspace/claw-ide
npm run build
npm run tauri build
sudo apt install ./src-tauri/target/release/bundle/deb/Claw\ IDE_1.1.15_amd64.deb
```

Claw IDE starts the local OpenClaw gateway when it is installed but stopped.
It does not package API keys, user settings, or unverified third-party
checkouts into the installer.

Provider settings saved in Claw IDE are injected into ClawCode and ClawBot
only for the child process that needs them. OpenAI-compatible providers use
`OPENAI_API_KEY` and `OPENAI_BASE_URL`; OpenRouter also receives
`OPENROUTER_API_KEY`; Anthropic-compatible, Gemini, and xAI providers receive
their corresponding provider variables. The credentials are not printed in
runtime health, terminal output, or error messages. Changing Settings affects
the next agent request or gateway launch; an already-running OpenClaw gateway
may need to be restarted from the terminal for environment changes to take
effect.

Provider setup is also available in **Settings**. Claw IDE can detect
`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, and `OPENAI_BASE_URL` from the process
environment without displaying their values. **Use detected environment** is
an explicit action that imports the key into Claw IDE's existing local settings.
Use **Verify connection** to send a minimal real request and see connected,
latency, or actionable failure status; configured credentials alone are not
reported as connected.

### macOS and Windows

Run `npm run tauri build`, then open the generated installer in
`src-tauri/target/release/bundle/` and install it over the existing application.
The exact installer format depends on the host operating system.

### Development-only update

To run the current source without installing a package:

```bash
npm run tauri dev
```

This is useful for testing changes, but it does not update the existing installed
application.

## Run, Debug, and Typechecks

Open the **Run and Tasks** view from the activity bar. It provides:

- Frontend typecheck/build: `npm run build`
- Rust backend typecheck: `cargo check --manifest-path src-tauri/Cargo.toml`
- Test execution: `npm test -- --run`
- A basic debug launcher for the active Python or JavaScript file

The debug launcher uses `python -m pdb` for Python and Node's inspector for
JavaScript. For long-running debug sessions, use the integrated terminal so you
can interact with the process and stop it explicitly. Terminal and debug
commands now stream output while they run and expose a Stop control.

## Search and Navigation

Open the **Search** view from the activity bar after opening a folder. Enter a
text query to search readable files recursively. Results are limited to the
first 500 matches and skip hidden directories plus common generated folders
(`node_modules`, `target`, `dist`, and `build`). An optional filename filter
narrows the search before files are scanned.

Click a result to open the file in Monaco. Monaco's built-in editor commands
remain available for in-file find/replace and code navigation.

## Workbench layout and agents

The activity bar controls only the **left sidebar**: Explorer, Search, Source
Control, Run/Tasks, and Extensions. The **right panel remains AI Chat** while
those left-side views change, so changing tools does not replace the chat
conversation.

Settings open from the top-row **Settings** menu in a modal instead of taking
over either workbench sidebar.

The Chat agent selector includes:

- API Provider — Ollama, OpenAI, OpenRouter, or OpenAI-compatible APIs
- ClawCode runtime — detects the local `claw` executable and reports whether its supported protocol is available
- ClawBot / OpenClaw — detects the local `openclaw` gateway executable

The runtime entries provide availability detection and an explicit status.
ClawCode requests use its supported JSON one-shot prompt surface. ClawBot
requests use the documented `openclaw acp` stdio bridge.

At startup, Claw IDE performs an agent-team health check and shows the result in
the Chat panel. The configured API provider is marked as the backup when it has
usable credentials. ClawCode is actively probed with `claw --version`; when that
probe succeeds, its CLI adapter is reported as ready and starts a one-shot
session when you select ClawCode and send a message. The current `claw acp serve`
command is documented by ClawCode as a status alias, so Claw IDE does not claim
that a persistent ClawCode ACP daemon is running.
When OpenClaw is installed but its local gateway is stopped, Claw IDE starts
`openclaw gateway --port 18789` during startup and verifies it before reporting
the runtime ready. No separate terminal command is required.
Use **Refresh** in the Chat panel after changing runtime state. OpenClaw is
marked ready only when `openclaw gateway status` succeeds; an installed but
unhealthy gateway is shown as degraded.
Runtime discovery checks common user install locations (`~/.local/bin`,
`~/.cargo/bin`, and NVM Node `bin` directories) as well as PATH, so desktop
launches do not depend entirely on the terminal environment.

## Agent Editing and Saving

The chat agent receives the selected workspace and active editor file as context.
When a request requires a file change, it can return a reviewable edit proposal.
The proposal shows the target path and complete replacement content with **Apply
edit** and **Reject** controls.

Applying an edit writes it to the local file through the Tauri backend and updates
the open Monaco tab. The change is marked clean because it has already been
written to disk. User edits still remain in the editor until the user saves them
with `Ctrl+S` (or `Cmd+S` on macOS).

The review-first workflow is intentional: the agent does not silently overwrite
local files.

When a model emits a tool request such as an `exec` command, Claw IDE removes
the raw markup from the conversation and shows a review card instead. The
command runs only after **Allow once** is selected; **Reject** leaves it
unexecuted.

## OpenRouter

OpenRouter uses its OpenAI-compatible chat endpoint. In **Settings**, choose
**OpenRouter**, enter an OpenRouter API key, and use:

```text
Base URL: https://openrouter.ai/api/v1
Model: openrouter/free
```

You can also use a specific OpenRouter model ID in the model field. The API key
is stored in the local Claw IDE settings file; do not commit or share that file.

The desktop app allows HTTPS provider connections through Tauri's
`connect-src` policy so OpenRouter and custom OpenAI-compatible endpoints can
work. Before the first request to each HTTPS host, Claw IDE shows a trust
confirmation. Only accept hosts you recognize; the request can include your
prompt and API key.

The CSP does not use `unsafe-inline` or `unsafe-eval`. Local Ollama endpoints
are also allowed. Rebuild the desktop package after changing
`src-tauri/tauri.conf.json`.

## File menu and zoom

The top-row **File** button opens editor actions similar to VS Code:

- Open Folder
- Save
- Save All
- Close Editor

Use `Ctrl+Plus` / `Ctrl+Minus` (or `Cmd` on macOS) to change editor font size,
and `Ctrl+0` / `Cmd+0` to reset it.

## Source control

The left **Source Control** view reads the current Git branch, changed files,
and a diff summary for the opened workspace. It is intentionally read-only in
this phase; staging, committing, branching, and conflict resolution remain
planned.

## CLI Version Compatibility

- **Minimum supported:** v0.15.0
- **Hard block:** below v0.12.0
- The IDE checks claw version on startup and warns if outdated.

## Development

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## License

MIT
