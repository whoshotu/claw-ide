# Claw IDE - Progress & Next Steps

## Current Status

### What's Built ✅

**Backend (Rust/Tauri):**
- `src-tauri/src/commands.rs` - All Tauri commands:
  - `get_current_directory` - Get current working directory
  - `read_directory` - List files in directory
  - `read_file` / `write_file` - File operations
  - `find_claw_binary` - Locate claw CLI (config → PATH)
  - `check_claw_version` - Version handshake (parses "Version X.Y.Z")
  - `spawn_claw` / `kill_claw_process` - Run claw CLI
- `src-tauri/src/lib.rs` - Logging setup with tracing + crash handler
- Config file: `~/.config/claw-ide/config.toml` (already created)

**Frontend (React/TypeScript):**
- `src/App.tsx` - Main 3-panel layout
- `src/components/FileTree.tsx` - File explorer
- `src/components/EditorPanel.tsx` - Monaco editor with tabs
- `src/components/ChatPanel.tsx` - AI chat panel
- `src/components/StatusBar.tsx` - Status bar
- `src/store/appStore.ts` - Zustand state management
- `src/index.css` - Dark theme styling

### Known Issues ⚠️

1. **Tauri IPC not connecting in dev mode**: The frontend loads from Vite (localhost:1420) but `window.__TAURI_INTERNALS__` isn't injected, so `invoke()` fails.

   **Root cause**: Using `devUrl` in tauri.conf.json bypasses Tauri's webview.

   **Fix options**:
   - Option A: Build production (`npm run build` + `npm run tauri build`)
   - Option B: Fix dev server config (requires more research)

---

## Quick Start (On Your Machine)

```bash
cd ~/Documents/Antigravity/claw-ide

# Install deps (done)
npm install

# Build for production
npm run build
npm run tauri build

# Or try dev again
npm run tauri dev
```

---

## Remaining Tasks

### P0 - Must Fix Before MVP Works
1. [ ] Get Tauri IPC working (build prod or fix config)
2. [ ] Test file tree - click file opens in editor
3. [ ] Test editor - can edit and save (Ctrl+S)
4. [ ] Test chat - send prompt, get response from claw
5. [ ] Test version warning - shows "v0.1.0 detected"

### P1 - Polish
1. [ ] Add more file type icons
2. [ ] Fix version warning - currently shows "outdated" (0.1.0 < 0.15.0)
3. [ ] Test terminal (Ctrl+`)

### P2 - Future Features
1. [ ] Session management (save/resume)
2. [ ] Settings panel
3. [ ] MCP tool integration

---

## Project Structure

```
claw-ide/
├── src/                      # React frontend
│   ├── App.tsx              # Main layout
│   ├── components/          # UI components
│   │   ├── FileTree.tsx
│   │   ├── EditorPanel.tsx
│   │   ├── ChatPanel.tsx
│   │   └── StatusBar.tsx
│   ├── store/
│   │   └── appStore.ts     # Zustand state
│   └── index.css
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs          # Logging setup
│   │   └── commands.rs    # Tauri commands
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## Config File

`~/.config/claw-ide/config.toml`:
```toml
[claw]
binary_path = "/path/to/claw"
default_model = "sonnet"
default_permission = "workspace-write"

[editor]
font_size = 14
tab_size = 4
theme = "dark"
```

---

## Testing Checklist

- [ ] App launches without errors
- [ ] File tree shows project files
- [ ] Click file → opens in Monaco editor
- [ ] Edit file → dirty indicator (dot) appears
- [ ] Ctrl+S → saves file
- [ ] Chat panel shows "claw not configured" or version
- [ ] Send message → claw responds
- [ ] Abort button stops claw process

---

## Next Steps

1. **Try building for production:**
   ```bash
   npm run build
   npm run tauri build
   ```
   Then run the built app.

2. **If that works**, MVP is done!

3. **If dev mode issues persist**, the fix is to either:
   - Use production build
   - Or fix the `devUrl` vs embedded dev server issue in Tauri 2.x

---

## Validation Gates (From Plan)

| Phase | Gate | Status |
|-------|------|--------|
| P0 | Project builds | ✅ Backend compiles |
| P1 | File tree + layout | ✅ 3 panels render |
| P2 | Monaco editor | ✅ Editor loads |
| P3 | Claw integration | ⚠️ IPC issue |

Once IPC works → MVP complete!
