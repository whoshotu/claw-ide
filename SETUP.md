# Claw IDE — Project Setup

Since Node.js isn't available on the build system, run these commands on your local machine to initialize the project:

## One-Time Setup

```bash
# 1. Install Node.js (if not installed)
# https://nodejs.org/ (LTS version)

# 2. Create the Tauri project
cd /path/to/your/projects
npm create tauri-app@latest claw-ide -- --template react-ts --manager npm

# 3. Enter the project
cd claw-ide

# 4. Install dependencies
npm install

# 5. Install additional dependencies
npm install @monaco-editor/react zustand lucide-react react-markdown

# 6. Install Vitest for testing
npm install -D vitest @testing-library/react @testing-library/jest-dom

# 7. Install Tauri plugins (for future phases)
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-clipboard-manager

# 8. Verify it builds
npm run tauri dev
```

## Project Structure After Setup

```
claw-ide/
├── src/                    # React frontend
│   ├── components/         # UI components (FileTree, Editor, ChatPanel)
│   ├── hooks/             # Custom React hooks
│   ├── store/             # Zustand state stores
│   ├── lib/               # Utility functions
│   ├── App.tsx            # Main app component
│   └── main.tsx           # Entry point
├── src-tauri/              # Rust backend
│   ├── src/
│   │   └── main.rs       # Tauri commands
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── index.html
└── README.md
```

## Phase Work Items

### P0: Project Skeleton
- [ ] Initialize Tauri 2.x with React + TypeScript
- [ ] Integrate Monaco Editor
- [ ] Configure Tailwind CSS v4
- [ ] Set up Rust tracing with log file output
- [ ] Verify blank window builds

### P1: UI Shell & File Tree
- [ ] Three-panel layout
- [ ] Resizable panels
- [ ] File tree with icons
- [ ] Tab management

### P2: Monaco Editor
- [ ] Syntax highlighting
- [ ] Find/Replace
- [ ] Save file (Ctrl+S)

### P3: Claw Integration
- [ ] Binary resolution (config → PATH → prompt)
- [ ] Version handshake
- [ ] Chat panel with streaming
- [ ] Tool invocation display
- [ ] Error handling

## Running the Project

```bash
# Development
npm run tauri dev

# Production build
npm run tauri build
```

## Key Files to Modify

1. `src-tauri/taauri.conf.json` — App name, window size, permissions
2. `src-tauri/src/main.rs` — Tauri commands
3. `src/App.tsx` — Main layout
4. `src/store/` — Zustand stores

---

*Run the setup commands above, then begin with P0 tasks.*