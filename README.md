# OpenCodex

A desktop GUI for AI-powered coding, built with Tauri 2 + React. Wraps the [opencode](https://github.com/opencode-ai/opencode) CLI with a native interface featuring multi-threaded conversations, streaming responses, and tool use.

Supports **OpenAI** (GPT-4.1, GPT-5.x, o-series), **Anthropic** (Claude), **Gemini**, and **Azure OpenAI**.

## Download

| Platform | Architecture | Link |
|----------|-------------|------|
| Windows | ARM64 (Snapdragon/Qualcomm) | [OpenCodex_1.0.0_arm64-setup.exe](releases/OpenCodex_1.0.0_arm64-setup.exe) |
| Windows | ARM64 (MSI) | [OpenCodex_1.0.0_arm64_en-US.msi](releases/OpenCodex_1.0.0_arm64_en-US.msi) |
| macOS | Apple Silicon (arm64) | [OpenCodex_1.0.0_aarch64.dmg](releases/OpenCodex_1.0.0_aarch64.dmg) |

## Quick Start (Windows)

Download the `.exe` installer or `.msi` from the table above and run it.

> Windows may show a SmartScreen warning on first launch. Click **More info** then **Run anyway**.

## Quick Start (macOS)

Download the `.dmg` from the table above, open it, and drag **OpenCodex** to Applications.

> On first launch macOS may block it. Go to **System Settings > Privacy & Security** and click **Open Anyway**.

### Prerequisites

The app requires the `opencode` CLI binary. Build it once:

**macOS / Linux:**
```bash
cd opencode-src
go build -o opencode .
cp opencode ~/.local/bin/opencode
```

**Windows (PowerShell):**
```powershell
cd opencode-src
go build -o opencode.exe .
Copy-Item opencode.exe "$env:USERPROFILE\.local\bin\opencode.exe"
```

Requires **Go 1.24+**. Make sure the binary location is in your `PATH`.

## Build from Source

### Requirements

- **Node.js** 18+
- **Rust** (latest stable) + `cargo`
- **Go** 1.24+
- Tauri CLI: `cargo install tauri-cli --version "^2"`
- **Windows only:** Visual Studio Build Tools 2022 with C++ ARM64/x64 workload

### Steps

```bash
# 1. Build the opencode CLI
cd opencode-src
go build -o opencode .       # macOS/Linux
# go build -o opencode.exe .  # Windows
cd ..

# 2. Install frontend dependencies
cd codex
npm install

# 3. Run in development mode
npx tauri dev

# 4. Or build a release
npx tauri build
# macOS  → .dmg + .app
# Windows → .msi + .exe (NSIS installer)
```

Release artifacts will be in `codex/src-tauri/target/release/bundle/`.

## Configuration

1. Launch OpenCodex
2. Click the **gear icon** to open Settings
3. Select your **provider** (OpenAI, Anthropic, Gemini, Azure)
4. Enter your **API key**
5. Click **Fetch Models** to load available models
6. Select a **model** and **reasoning effort** (shown only for reasoning models)
7. **Save** and start coding

## Project Structure

```
codexforwindows/
  codex/              # Tauri 2 app (Rust backend + React frontend)
    src/              # React components
    src-tauri/        # Rust backend (commands, LLM, git, terminal)
  opencode-src/       # opencode Go CLI (LLM providers, tools, streaming)
  releases/           # Pre-built installers (Windows .msi/.exe, macOS .dmg)
```
