use crate::storage::Settings;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
pub struct OpenCodeState {
    /// Maps session_id → oneshot sender that signals cancellation.
    cancellers: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
}

/// A streaming event parsed from opencode's stderr JSON lines
#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct StderrEvent {
    #[serde(rename = "type")]
    event_type: String,
    content: Option<String>,
    name: Option<String>,
    id: Option<String>,
    input: Option<String>,
    tool_call_id: Option<String>,
    model: Option<String>,
}

/// Sent to frontend for each streaming event
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeStreamEvent {
    pub event_type: String,
    pub session_id: String,
    /// Text content delta or tool result content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Model ID used for this event
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Tool name (for tool_start, tool_done, tool_result)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    /// Tool call ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_id: Option<String>,
    /// Tool input JSON (for tool_start)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeDone {
    pub output: String,
    pub session_id: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeError {
    pub error: String,
    pub session_id: String,
}

fn find_opencode_binary() -> Option<String> {
    if let Ok(path) = std::env::var("OPENCODE_PATH") {
        if !path.is_empty() && std::path::Path::new(&path).exists() {
            return Some(path);
        }
    }

    // Check next to the executable itself
    if let Ok(cwd) = std::env::current_dir() {
        let binary_name = if cfg!(windows) { "opencode.exe" } else { "opencode" };
        let local = cwd.join("opencode-src").join(binary_name);
        if local.exists() {
            return Some(local.to_string_lossy().to_string());
        }
    }

    // Platform-specific candidate paths
    #[cfg(windows)]
    let candidates = [
        dirs::home_dir().map(|h| h.join(".local\\bin\\opencode.exe")),
        dirs::home_dir().map(|h| h.join("go\\bin\\opencode.exe")),
        dirs::home_dir().map(|h| h.join("AppData\\Local\\bin\\opencode.exe")),
    ];
    #[cfg(not(windows))]
    let candidates = [
        dirs::home_dir().map(|h| h.join(".local/bin/opencode")),
        Some(std::path::PathBuf::from("/usr/local/bin/opencode")),
        Some(std::path::PathBuf::from("/usr/bin/opencode")),
        dirs::home_dir().map(|h| h.join("go/bin/opencode")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    // Use platform-appropriate lookup command
    let (lookup_cmd, lookup_arg) = if cfg!(windows) {
        ("where", "opencode")
    } else {
        ("which", "opencode")
    };
    let mut cmd = std::process::Command::new(lookup_cmd);
    cmd.arg(lookup_arg);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    None
}

pub fn check_opencode() -> Result<String, String> {
    match find_opencode_binary() {
        Some(path) => Ok(path),
        None => Err("opencode binary not found".to_string()),
    }
}

/// Write .opencode.json config in the project directory (always synced with current settings)
fn ensure_opencode_config(project_dir: &str, settings: &Settings) {
    let config_path = std::path::Path::new(project_dir).join(".opencode.json");

    // Determine provider and model for opencode config
    let (provider_name, api_key) = match settings.provider.as_str() {
        "anthropic" => ("anthropic", &settings.anthropic_api_key),
        "gemini" => ("gemini", &settings.gemini_api_key),
        "azure" => ("openai", &settings.azure_openai_api_key), // Azure uses OpenAI-compatible format in opencode
        _ => ("openai", &settings.openai_api_key),
    };

    let model = if settings.model.is_empty() {
        match provider_name {
            "anthropic" => "claude-sonnet-4-5-20250929",
            "gemini" => "gemini-2.0-flash",
            _ => "gpt-4.1",
        }
    } else {
        &settings.model
    };

    // Pass effort through as-is; the opencode binary clamps per-model via SupportedEfforts
    let reasoning_effort = match settings.effort.as_str() {
        "none" | "minimal" | "low" | "medium" | "high" | "xhigh" => Some(settings.effort.as_str()),
        _ => None,
    };

    let mut coder_agent = serde_json::json!({
        "model": model,
        "maxTokens": 8192
    });
    let mut task_agent = serde_json::json!({
        "model": model,
        "maxTokens": 4096
    });
    let mut title_agent = serde_json::json!({
        "model": model,
        "maxTokens": 80
    });

    if let Some(effort) = reasoning_effort {
        coder_agent["reasoningEffort"] = serde_json::Value::String(effort.to_string());
        task_agent["reasoningEffort"] = serde_json::Value::String(effort.to_string());
        title_agent["reasoningEffort"] = serde_json::Value::String(effort.to_string());
    }

    let mut config = serde_json::json!({
        "agents": {
            "coder": coder_agent,
            "task": task_agent,
            "title": title_agent
        }
    });

    // Only write provider config when a key is set to avoid overriding
    // environment-based auth with an empty apiKey.
    if !api_key.is_empty() {
        config["providers"] = serde_json::json!({
            provider_name: {
                "apiKey": api_key,
                "disabled": false
            }
        });
    }

    if let Ok(content) = serde_json::to_string_pretty(&config) {
        let _ = std::fs::write(&config_path, content);
    }
}

pub async fn run_opencode(
    app: tauri::AppHandle,
    state: &OpenCodeState,
    prompt: String,
    project_dir: String,
    session_id: String,
    settings: &Settings,
) -> Result<(), String> {
    let binary = find_opencode_binary()
        .ok_or_else(|| "opencode binary not found".to_string())?;

    // Write .opencode.json config if it doesn't exist
    ensure_opencode_config(&project_dir, settings);

    let mut cmd = Command::new(&binary);
    cmd.arg("-p").arg(&prompt)
        .arg("-c").arg(&project_dir)
        .arg("-f").arg("json")
        .arg("-q");

    // Pass API keys as environment variables so opencode can detect providers
    if !settings.openai_api_key.is_empty() {
        cmd.env("OPENAI_API_KEY", &settings.openai_api_key);
    }
    if !settings.anthropic_api_key.is_empty() {
        cmd.env("ANTHROPIC_API_KEY", &settings.anthropic_api_key);
    }
    if !settings.gemini_api_key.is_empty() {
        cmd.env("GEMINI_API_KEY", &settings.gemini_api_key);
    }
    if !settings.azure_openai_api_key.is_empty() {
        cmd.env("AZURE_OPENAI_API_KEY", &settings.azure_openai_api_key);
    }
    if !settings.azure_openai_endpoint.is_empty() {
        cmd.env("AZURE_OPENAI_ENDPOINT", &settings.azure_openai_endpoint);
    }

    // Inherit PATH so opencode can find tools
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn opencode: {}", e))?;

    let stderr = child.stderr.take();
    let stdout = child.stdout.take();

    // Create a oneshot channel for cancellation. The sender is stored in the
    // map; cancel_opencode drops it (or sends) to signal this task.
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut guard = state.cancellers.lock().await;
        guard.insert(session_id.clone(), cancel_tx);
    }

    let app_progress = app.clone();
    let sid_progress = session_id.clone();

    let stderr_handle = tokio::spawn(async move {
        let mut collected: Vec<String> = Vec::new();
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }
                if line.contains("FZF not found") {
                    continue;
                }

                // Try to parse as JSON streaming event
                if let Ok(evt) = serde_json::from_str::<StderrEvent>(&line) {
                    // Use id if present, otherwise fall back to tool_call_id
                    let tool_id = evt.id.or(evt.tool_call_id);
                    let stream_event = OpenCodeStreamEvent {
                        event_type: evt.event_type,
                        session_id: sid_progress.clone(),
                        content: evt.content,
                        model: evt.model,
                        tool_name: evt.name,
                        tool_id,
                        tool_input: evt.input,
                    };
                    let _ = app_progress.emit("opencode-stream", stream_event);
                } else {
                    collected.push(line);
                }
            }
        }
        collected.join("\n")
    });

    let stdout_handle = tokio::spawn(async move {
        let mut output = String::new();
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if !output.is_empty() {
                    output.push('\n');
                }
                output.push_str(&line);
            }
        }
        output
    });

    // Wait for the child to exit OR cancellation signal — no locks held.
    let cancelled = tokio::select! {
        result = child.wait() => {
            // Process exited naturally — handle below
            let _ = result; // status handled after joining readers
            false
        }
        _ = cancel_rx => {
            // Cancellation requested — kill the process
            let _ = child.kill().await;
            true
        }
    };

    // Remove from cancellers map
    {
        let mut guard = state.cancellers.lock().await;
        guard.remove(&session_id);
    }

    // If cancelled, emit an error event and return early
    if cancelled {
        // Wait for readers to finish (pipes close after kill)
        let _ = stderr_handle.await;
        let _ = stdout_handle.await;
        let _ = app.emit("opencode-error", OpenCodeError {
            error: "Cancelled".to_string(),
            session_id,
        });
        return Ok(());
    }

    // Collect the final exit status by waiting once more (already exited)
    let status = child.try_wait().map_err(|e| format!("Failed to get exit status: {}", e))?;

    let stderr_output = stderr_handle.await.unwrap_or_default();
    let output = stdout_handle.await.unwrap_or_default();

    match status {
        Some(exit) if exit.success() => {
            let _ = app.emit("opencode-done", OpenCodeDone {
                output,
                session_id,
            });
        }
        Some(exit) => {
            let mut err_msg = format!(
                "opencode exited with code: {}.",
                exit.code().unwrap_or(-1)
            );
            if !stderr_output.trim().is_empty() {
                err_msg.push_str(&format!("\nStderr:\n{}", stderr_output.trim()));
            }
            if !output.trim().is_empty() {
                err_msg.push_str(&format!("\nStdout:\n{}", output.trim()));
            }
            let _ = app.emit("opencode-error", OpenCodeError {
                error: err_msg,
                session_id,
            });
        }
        None => {
            // Should not happen since select! waited for exit
            let _ = app.emit("opencode-error", OpenCodeError {
                error: "opencode process state unknown".to_string(),
                session_id,
            });
        }
    }

    Ok(())
}

pub async fn cancel_opencode(state: &OpenCodeState, session_id: &str) {
    let mut guard = state.cancellers.lock().await;
    if let Some(tx) = guard.remove(session_id) {
        // Send cancellation signal; run_opencode's select! will kill the child.
        let _ = tx.send(());
    }
}
