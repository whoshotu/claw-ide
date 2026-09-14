# Claw IDE

A Tauri 2.x + React + Monaco Editor desktop IDE that wraps the `claw` CLI.

## Features

- **Monaco Editor** — VS Code's editor with syntax highlighting, find/replace, code folding
- **File Tree** — Browse project files with expand/collapse directories
- **AI Chat Panel** — Interact with the claw CLI directly from the IDE
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

## Configuration

Create `~/.config/claw-ide/config.toml`:

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