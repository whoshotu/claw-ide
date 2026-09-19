use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Emitter};
use std::io::{BufRead, BufReader, Read};

#[derive(Debug, Serialize, Deserialize, Default)]
struct AppSettings {
    api_provider: String,
    api_base_url: String,
    api_key: String,
    model: String,
    permission_mode: String,
}

fn settings_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or_else(|| "Config directory is unavailable".to_string())?;
    let claw_dir = config_dir.join("claw-ide");
    std::fs::create_dir_all(&claw_dir).map_err(|e| e.to_string())?;
    Ok(claw_dir.join("settings.json"))
}

fn load_settings() -> AppSettings {
    settings_path()
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

fn apply_provider_environment(command: &mut std::process::Command, settings: &AppSettings) {
    let key = settings.api_key.trim();
    let base_url = settings.api_base_url.trim();
    if key.is_empty() {
        return;
    }

    match settings.api_provider.as_str() {
        "anthropic-compatible" => {
            command.env("ANTHROPIC_API_KEY", key);
            if !base_url.is_empty() {
                command.env("ANTHROPIC_BASE_URL", base_url);
            }
        }
        "gemini" => {
            command.env("GEMINI_API_KEY", key);
            command.env("GOOGLE_API_KEY", key);
        }
        "xai" => {
            command.env("XAI_API_KEY", key);
            command.env("OPENAI_API_KEY", key);
            if !base_url.is_empty() {
                command.env("OPENAI_BASE_URL", base_url);
            }
        }
        "deepseek" | "openai-compatible" | "openai" | "openrouter" => {
            command.env("OPENAI_API_KEY", key);
            if settings.api_provider == "openrouter" {
                command.env("OPENROUTER_API_KEY", key);
            }
            if !base_url.is_empty() {
                command.env("OPENAI_BASE_URL", base_url);
            }
        }
        "ollama" => {}
        _ => {
            command.env("OPENAI_API_KEY", key);
            if !base_url.is_empty() {
                command.env("OPENAI_BASE_URL", base_url);
            }
        }
    }
}

fn resolve_binary(binary_name: &str) -> Option<String> {
    let mut candidates = vec![
        format!("/usr/local/bin/{binary_name}"),
        format!("/usr/bin/{binary_name}"),
        format!("./{binary_name}"),
    ];

    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".local/bin").join(binary_name).to_string_lossy().to_string());
        candidates.push(home.join(".cargo/bin").join(binary_name).to_string_lossy().to_string());
        let nvm_dir = home.join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(nvm_dir) {
            for entry in entries.flatten() {
                candidates.push(
                    entry
                        .path()
                        .join("bin")
                        .join(binary_name)
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }
    }

    if let Ok(path_var) = std::env::var("PATH") {
        for entry in std::env::split_paths(&path_var) {
            candidates.push(entry.join(binary_name).to_string_lossy().to_string());
        }

    }

    for path in candidates {
        if std::path::Path::new(&path).exists() {
            return Some(path);
        }
    }

    None
}

fn probe_command(binary: &str, args: &[&str]) -> bool {
    std::process::Command::new(binary)
        .args(args)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[command]
pub async fn get_current_directory() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[command]
pub async fn read_directory(path: String) -> Result<Vec<serde_json::Value>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result = vec![];
    for entry in entries.flatten() {
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let extension = entry
            .path()
            .extension()
            .and_then(|ext| ext.to_str())
            .map(str::to_owned);

        result.push(serde_json::json!({
            "name": entry.file_name().to_string_lossy(),
            "isDir": meta.is_dir(),
            "path": entry.path().to_string_lossy(),
            "extension": extension,
        }));
    }
    Ok(result)
}

#[command]
pub async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[command]
pub async fn git_status(cwd: String) -> Result<serde_json::Value, String> {
    let working_directory = std::path::Path::new(cwd.trim());
    if !working_directory.is_dir() {
        return Err(format!("Git working directory does not exist: {}", working_directory.display()));
    }
    let branch = std::process::Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(working_directory)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if !branch.status.success() {
        return Ok(serde_json::json!({
            "branch": "Not a Git repository",
            "changes": [],
            "diff": "",
            "isRepository": false
        }));
    }
    let status = std::process::Command::new("git")
        .args(["status", "--short"])
        .current_dir(working_directory)
        .output()
        .map_err(|e| format!("Failed to read Git status: {e}"))?;
    let diff = std::process::Command::new("git")
        .args(["diff", "--stat"])
        .current_dir(working_directory)
        .output()
        .map_err(|e| format!("Failed to read Git diff: {e}"))?;
    Ok(serde_json::json!({
        "branch": String::from_utf8_lossy(&branch.stdout).trim(),
        "changes": String::from_utf8_lossy(&status.stdout).lines().map(str::to_owned).collect::<Vec<_>>(),
        "diff": String::from_utf8_lossy(&diff.stdout).to_string(),
        "isRepository": true,
    }))
}

#[command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[command]
pub async fn find_claw_binary() -> Result<String, String> {
    resolve_binary("claw").ok_or_else(|| "claw binary not found".to_string())
}

#[command]
pub async fn check_claw_version() -> Result<String, String> {
    let binary = resolve_binary("claw").ok_or_else(|| "claw binary not found".to_string())?;
    let output = std::process::Command::new(&binary)
        .arg("--version")
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok(if !stdout.trim().is_empty() {
        stdout
    } else {
        stderr
    })
}

#[command]
pub async fn spawn_claw(args: Vec<String>) -> Result<u32, String> {
    let binary = resolve_binary("claw").ok_or_else(|| "claw binary not found".to_string())?;
    let mut command = std::process::Command::new(&binary);
    command.args(&args);
    apply_provider_environment(&mut command, &load_settings());
    let child = command
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(child.id())
}

#[command]
pub async fn kill_claw_process(pid: u32) -> Result<(), String> {
    std::process::Command::new("kill")
        .arg(pid.to_string())
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn spawn_openclaw(args: Vec<String>) -> Result<u32, String> {
    let binary = resolve_binary("openclaw").ok_or_else(|| "openclaw gateway not found".to_string())?;
    let mut command = std::process::Command::new(&binary);
    command.args(&args);
    apply_provider_environment(&mut command, &load_settings());
    let child = command
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(child.id())
}

#[command]
pub async fn find_openclaw_gateway() -> Result<String, String> {
    resolve_binary("openclaw").ok_or_else(|| "openclaw gateway not found".to_string())
}

fn ensure_openclaw_gateway() {
    let Some(binary) = resolve_binary("openclaw") else {
        return;
    };
    if probe_command(&binary, &["gateway", "status"]) {
        return;
    }
    let mut command = std::process::Command::new(binary);
    command.args(["gateway", "--port", "18789"]);
    apply_provider_environment(&mut command, &load_settings());
    let _ = command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    for _ in 0..20 {
        std::thread::sleep(std::time::Duration::from_millis(250));
        if let Some(binary) = resolve_binary("openclaw") {
            if probe_command(&binary, &["gateway", "status"]) {
                break;
            }
        }
    }
}

#[command]
pub async fn initialize_agent_harness(api_configured: bool) -> Result<serde_json::Value, String> {
    ensure_openclaw_gateway();
    let claw_code = resolve_binary("claw")
        .filter(|binary| probe_command(binary, &["--version"]))
        .map(|_| "ready")
        .unwrap_or("unavailable");
    let claw_bot = if let Some(binary) = resolve_binary("openclaw") {
        if probe_command(&binary, &["gateway", "status"]) {
            "ready"
        } else {
            "degraded"
        }
    } else {
        "unavailable"
    };
    let api_backup = if api_configured { "ready" } else { "unavailable" };
    let active_backend = if claw_bot == "ready" {
        "clawbot"
    } else if api_backup == "ready" {
        "provider"
    } else {
        "provider"
    };
    let message = if claw_code == "unavailable" && claw_bot == "unavailable" {
        "ClawCode unavailable; ClawBot unavailable; using API backup."
    } else if claw_code == "ready" && claw_bot == "degraded" {
        "ClawCode CLI adapter ready; OpenClaw gateway needs attention."
    } else if claw_code == "ready" {
        "ClawCode CLI adapter ready; it starts one-shot sessions when selected."
    } else if claw_bot == "degraded" {
        "OpenClaw found but its gateway is not healthy; using API backup until it recovers."
    } else if claw_code == "unavailable" {
        "ClawCode protocol unavailable; using available ClawBot/API backup."
    } else {
        "Agent team health check complete."
    };
    Ok(serde_json::json!({
        "clawCode": claw_code,
        "clawBot": claw_bot,
        "apiBackup": api_backup,
        "activeBackend": active_backend,
        "message": message,
    }))
}

#[command]
pub async fn refresh_agent_harness(api_configured: bool) -> Result<serde_json::Value, String> {
    initialize_agent_harness(api_configured).await
}

#[command]
pub async fn run_agent_prompt(
    backend: String,
    prompt: String,
    cwd: String,
) -> Result<String, String> {
    let working_directory = std::path::Path::new(cwd.trim());
    if !working_directory.is_dir() {
        return Err(format!("Agent workspace does not exist: {}", working_directory.display()));
    }

    match backend.as_str() {
        "claw-code" => {
            let binary = resolve_binary("claw")
                .ok_or_else(|| "ClawCode binary not found".to_string())?;
            let mut command = std::process::Command::new(binary);
            command.args(["--output-format", "json", "prompt", &prompt]);
            command.current_dir(working_directory);
            apply_provider_environment(&mut command, &load_settings());
            let output = command
                .output()
                .map_err(|error| format!("Failed to start ClawCode: {error}"))?;
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
            }
            let value: serde_json::Value = serde_json::from_slice(&output.stdout)
                .map_err(|error| format!("ClawCode returned invalid JSON: {error}"))?;
            Ok(value
                .get("result")
                .and_then(serde_json::Value::as_str)
                .or_else(|| value.get("content").and_then(serde_json::Value::as_str))
                .unwrap_or_else(|| std::str::from_utf8(&output.stdout).unwrap_or(""))
                .to_string())
        }
        "clawbot" => run_openclaw_acp_prompt(&prompt, working_directory),
        _ => Err("Unsupported agent backend".to_string()),
    }
}

fn run_openclaw_acp_prompt(
    prompt: &str,
    working_directory: &std::path::Path,
) -> Result<String, String> {
    let binary = resolve_binary("openclaw")
        .ok_or_else(|| "OpenClaw binary not found".to_string())?;
    let mut command = std::process::Command::new(binary);
    command.arg("acp").current_dir(working_directory);
    apply_provider_environment(&mut command, &load_settings());
    let mut child = command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start OpenClaw ACP bridge: {error}"))?;
    let mut input = child.stdin.take().ok_or_else(|| "OpenClaw ACP stdin unavailable".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "OpenClaw ACP stdout unavailable".to_string())?;
    let initialize = serde_json::json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": 1,
                "clientInfo": { "name": "claw-ide", "version": env!("CARGO_PKG_VERSION") }
            }
        });
    let new_session = serde_json::json!({
            "jsonrpc": "2.0", "id": 2, "method": "session/new",
            "params": { "cwd": working_directory.to_string_lossy(), "mcpServers": [] }
        });
    use std::io::Write;
    writeln!(input, "{}", initialize).map_err(|error| format!("Failed to write ACP request: {error}"))?;
    writeln!(input, "{}", new_session).map_err(|error| format!("Failed to write ACP request: {error}"))?;
    input.flush().map_err(|error| format!("Failed to flush ACP setup: {error}"))?;
    let mut reader = BufReader::new(stdout);
    let mut session_id = String::new();
    while session_id.is_empty() {
        let mut line = String::new();
        if reader.read_line(&mut line).map_err(|error| format!("Failed to read ACP setup: {error}"))? == 0 {
            return Err("OpenClaw ACP closed before creating a session".to_string());
        }
        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if value.get("id").and_then(serde_json::Value::as_i64) == Some(2) {
            session_id = value
                .pointer("/result/sessionId")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| "OpenClaw ACP did not return a session id".to_string())?
                .to_string();
        }
    }
    writeln!(
        input,
        "{}",
        serde_json::json!({
            "jsonrpc": "2.0", "id": 3, "method": "session/prompt",
            "params": { "sessionId": session_id, "prompt": [{ "type": "text", "text": prompt }] }
        })
    )
    .map_err(|error| format!("Failed to write ACP prompt: {error}"))?;
    input.flush().map_err(|error| format!("Failed to flush ACP prompt: {error}"))?;

    let mut response = String::new();
    for line in reader.lines() {
        let line = line.map_err(|error| format!("Failed to read OpenClaw ACP output: {error}"))?;
        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if value.get("method").and_then(serde_json::Value::as_str) == Some("session/update") {
            response.push_str(&extract_acp_text(&value));
        }
        if value.get("id").and_then(serde_json::Value::as_i64) == Some(3) {
            let result_text = extract_acp_text(&value);
            if !result_text.is_empty() {
                response.push_str(&result_text);
            }
            break;
        }
    }
    let _ = child.kill();
    if response.trim().is_empty() {
        return Err("OpenClaw ACP returned no assistant text".to_string());
    }
    Ok(response)
}

fn extract_acp_text(value: &serde_json::Value) -> String {
    value
        .pointer("/result/content")
        .or_else(|| value.pointer("/params/update/content"))
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("text").and_then(serde_json::Value::as_str))
                .collect::<Vec<_>>()
                .join("")
        })
        .or_else(|| {
            value
                .pointer("/params/update/content/text")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| value.pointer("/result/text").and_then(serde_json::Value::as_str).map(str::to_string))
        .unwrap_or_default()
}

fn pick_directory_with_fallback() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        for args in [
            vec!["zenity", "--file-selection", "--directory"],
            vec!["kdialog", "--getexistingdirectory"],
            vec!["yad", "--file-selection", "--directory"],
            vec!["qarma", "--file-selection", "--directory"],
        ] {
            let mut command = std::process::Command::new(&args[0]);
            command.args(&args[1..]);
            if let Ok(output) = command.output() {
                let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !selected.is_empty() {
                    return Ok(selected);
                }
            }
        }
        return Err("No Linux folder picker is installed. Install zenity or kdialog, then try Open Folder again.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("osascript")
            .args(["-e", "tell application \"Finder\" to return (choose folder) as text"])
            .output()
            .map_err(|e| e.to_string())?;
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            return Err("No folder selected".to_string());
        }
        Ok(selected)
    }

    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowDialog() | Out-Null; if ($f.SelectedPath) { $f.SelectedPath }",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            return Err("No folder selected".to_string());
        }
        Ok(selected)
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Err("Folder selection is not supported on this platform".to_string())
    }
}

#[command]
pub async fn pick_directory() -> Result<String, String> {
    pick_directory_with_fallback()
}

#[command]
pub async fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[command]
pub async fn search_workspace(
    path: String,
    query: String,
    file_filter: String,
    case_sensitive: bool,
) -> Result<Vec<serde_json::Value>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let needle = if case_sensitive {
        query.to_string()
    } else {
        query.to_lowercase()
    };
    let mut results = Vec::new();
    let mut directories = vec![std::path::PathBuf::from(path)];

    while let Some(directory) = directories.pop() {
        let entries = std::fs::read_dir(&directory).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if entry_path.is_dir() {
                if !name.starts_with('.') && !matches!(name.as_str(), "node_modules" | "target" | "dist" | "build") {
                    directories.push(entry_path);
                }
                continue;
            }
            if results.len() >= 500 || (!file_filter.trim().is_empty() && !name.contains(file_filter.trim())) {
                continue;
            }

            let Ok(content) = std::fs::read_to_string(&entry_path) else {
                continue;
            };
            for (line_index, line) in content.lines().enumerate() {
                let haystack = if case_sensitive {
                    line.to_string()
                } else {
                    line.to_lowercase()
                };
                if haystack.contains(&needle) {
                    results.push(serde_json::json!({
                        "path": entry_path.to_string_lossy(),
                        "line": line_index + 1,
                        "text": line.trim(),
                    }));
                    if results.len() >= 500 {
                        break;
                    }
                }
            }
        }
    }

    Ok(results)
}

#[command]
pub async fn read_settings() -> Result<serde_json::Value, String> {
    let path = settings_path()?;
    if !path.exists() {
        let default = AppSettings {
            api_provider: "ollama".to_string(),
            api_base_url: "http://127.0.0.1:11434".to_string(),
            api_key: String::new(),
            model: "qwen3:8b".to_string(),
            permission_mode: "workspace-write".to_string(),
        };
        let payload = serde_json::to_value(default).map_err(|e| e.to_string())?;
        std::fs::write(&path, payload.to_string()).map_err(|e| e.to_string())?;
        return Ok(payload);
    }

    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed: AppSettings = serde_json::from_str(&contents).unwrap_or_default();
    let payload = serde_json::json!({
        "apiProvider": parsed.api_provider,
        "apiBaseUrl": parsed.api_base_url,
        "apiKey": parsed.api_key,
        "model": parsed.model,
        "permissionMode": parsed.permission_mode,
    });
    Ok(payload)
}

#[command]
pub async fn write_settings(settings: serde_json::Value) -> Result<(), String> {
    let path = settings_path()?;
    let record = AppSettings {
        api_provider: settings.get("apiProvider").and_then(|v| v.as_str()).unwrap_or("ollama").to_string(),
        api_base_url: settings.get("apiBaseUrl").and_then(|v| v.as_str()).unwrap_or("http://127.0.0.1:11434").to_string(),
        api_key: settings.get("apiKey").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        model: settings.get("model").and_then(|v| v.as_str()).unwrap_or("qwen3:8b").to_string(),
        permission_mode: settings.get("permissionMode").and_then(|v| v.as_str()).unwrap_or("workspace-write").to_string(),
    };

    let serialized = serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?;
    std::fs::write(&path, serialized).map_err(|e| e.to_string())
}

#[command]
pub async fn provider_environment() -> Result<serde_json::Value, String> {
    let openrouter = std::env::var("OPENROUTER_API_KEY").ok().filter(|value| !value.trim().is_empty());
    let openai = std::env::var("OPENAI_API_KEY").ok().filter(|value| !value.trim().is_empty());
    let base_url = std::env::var("OPENAI_BASE_URL").ok().filter(|value| !value.trim().is_empty());
    Ok(serde_json::json!({
        "openrouterConfigured": openrouter.is_some(),
        "openaiConfigured": openai.is_some(),
        "openaiBaseUrl": base_url,
        "source": if openrouter.is_some() { "OPENROUTER_API_KEY" } else if openai.is_some() { "OPENAI_API_KEY" } else { "none" }
    }))
}

#[command]
pub async fn import_provider_environment() -> Result<serde_json::Value, String> {
    let key = std::env::var("OPENROUTER_API_KEY")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| std::env::var("OPENAI_API_KEY").ok().filter(|value| !value.trim().is_empty()))
        .ok_or_else(|| "No OPENROUTER_API_KEY or OPENAI_API_KEY is available to import.".to_string())?;
    let use_openrouter = std::env::var("OPENROUTER_API_KEY").ok().filter(|value| !value.trim().is_empty()).is_some();
    let path = settings_path()?;
    let mut settings = if path.exists() {
        serde_json::from_str::<serde_json::Value>(&std::fs::read_to_string(&path).map_err(|error| error.to_string())?)
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    if let Some(object) = settings.as_object_mut() {
        object.insert("api_provider".to_string(), serde_json::json!(if use_openrouter { "openrouter" } else { "openai" }));
        object.insert("api_base_url".to_string(), serde_json::json!(
            std::env::var("OPENAI_BASE_URL").unwrap_or_else(|_| if use_openrouter { "https://openrouter.ai/api/v1".to_string() } else { "https://api.openai.com/v1".to_string() })
        ));
        object.insert("api_key".to_string(), serde_json::json!(key));
        if use_openrouter && !object.contains_key("model") {
            object.insert("model".to_string(), serde_json::json!("openrouter/free"));
        }
    }
    std::fs::write(&path, serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "source": if use_openrouter { "OPENROUTER_API_KEY" } else { "OPENAI_API_KEY" }, "imported": true }))
}

#[command]
pub async fn verify_provider_connection(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
) -> Result<serde_json::Value, String> {
    let started = std::time::Instant::now();
    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Provider base URL is required.".to_string());
    }
    let client = reqwest::Client::new();
    let response = if provider == "ollama" {
        client.get(format!("{base}/api/tags")).send().await
    } else {
        if api_key.trim().is_empty() {
            return Err(format!("{provider} requires an API key."));
        }
        client
            .post(format!("{base}/chat/completions"))
            .bearer_auth(api_key.trim())
            .header("HTTP-Referer", "https://claw-ide.local")
            .header("X-Title", "Claw IDE")
            .json(&serde_json::json!({
                "model": model.trim(),
                "messages": [{"role": "user", "content": "Reply with OK."}],
                "max_tokens": 8,
                "stream": false
            }))
            .send()
            .await
    };
    let response = response.map_err(|error| format!("Connection failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Provider returned HTTP {}: {}", status.as_u16(), body.chars().take(300).collect::<String>()));
    }
    Ok(serde_json::json!({
        "provider": provider,
        "model": model,
        "latencyMs": started.elapsed().as_millis(),
        "status": "connected"
    }))
}

#[derive(Debug, Serialize)]
pub struct TerminalResult {
    pub output: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcessOutput {
    pub pid: u32,
    pub stream: String,
    pub output: String,
    pub done: bool,
    pub exit_code: Option<i32>,
}

fn forward_process_output<R: Read + Send + 'static>(app: AppHandle, pid: u32, stream: &'static str, reader: R) {
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines().flatten() {
            let _ = app.emit("process-output", ProcessOutput {
                pid,
                stream: stream.to_string(),
                output: line,
                done: false,
                exit_code: None,
            });
        }
    });
}

#[command]
pub async fn start_terminal_process(app: AppHandle, command: String, cwd: String) -> Result<u32, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Terminal command cannot be empty".to_string());
    }
    let working_directory = std::path::Path::new(cwd.trim());
    if !working_directory.is_dir() {
        return Err(format!("Terminal working directory does not exist: {}", working_directory.display()));
    }

    #[cfg(target_os = "windows")]
    let mut process = {
        let mut process = std::process::Command::new("cmd");
        process.args(["/C", trimmed]);
        process
    };
    #[cfg(not(target_os = "windows"))]
    let mut process = {
        let mut process = std::process::Command::new("sh");
        process.args(["-lc", trimmed]);
        process
    };

    let mut child = process
        .current_dir(working_directory)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start terminal process: {e}"))?;
    let pid = child.id();
    let stdout = child.stdout.take().ok_or_else(|| "Could not capture process stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Could not capture process stderr".to_string())?;

    forward_process_output(app.clone(), pid, "stdout", stdout);
    forward_process_output(app.clone(), pid, "stderr", stderr);

    std::thread::spawn(move || {
        let exit_code = child.wait().ok().and_then(|status| status.code());
        let _ = app.emit("process-output", ProcessOutput {
            pid,
            stream: "process".to_string(),
            output: String::new(),
            done: true,
            exit_code,
        });
    });

    Ok(pid)
}

#[command]
pub async fn stop_terminal_process(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status()
        .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    let status = std::process::Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        #[cfg(not(target_os = "windows"))]
        if status.code() == Some(1) {
            return Ok(());
        }
        Err(format!("Could not stop process {pid}"))
    }
}

#[command]
pub async fn execute_terminal(command: String, cwd: String) -> Result<TerminalResult, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Terminal command cannot be empty".to_string());
    }

    let working_directory = std::path::Path::new(cwd.trim());
    if !working_directory.is_dir() {
        return Err(format!("Terminal working directory does not exist: {}", working_directory.display()));
    }

    #[cfg(target_os = "windows")]
    let mut process = {
        let mut process = std::process::Command::new("cmd");
        process.args(["/C", trimmed]);
        process
    };

    #[cfg(not(target_os = "windows"))]
    let mut process = {
        let mut process = std::process::Command::new("sh");
        process.args(["-lc", trimmed]);
        process
    };

    let output = process
        .current_dir(working_directory)
        .output()
        .map_err(|e| format!("Failed to start terminal command: {e}"))?;

    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.is_empty() {
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(&stderr);
    }

    Ok(TerminalResult {
        output: text,
        exit_code: output.status.code(),
    })
}
