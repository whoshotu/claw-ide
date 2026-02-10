// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;
mod opencode;
mod storage;
mod terminal;

use serde::{Deserialize, Serialize};
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use storage::{MemoryItem, Project, Session, Settings};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamRequest {
    pub messages: Vec<ChatMessage>,
    pub settings: Settings,
    pub session_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeRequest {
    pub prompt: String,
    pub project_dir: String,
    pub session_id: String,
    pub settings: Settings,
}

// --- Settings Commands ---
#[tauri::command]
fn get_settings() -> Settings {
    storage::load_settings()
}

#[tauri::command]
fn save_settings(settings: Settings) -> Result<(), String> {
    storage::save_settings(&settings).map_err(|e| e.to_string())
}

// --- Project Commands ---
#[tauri::command]
fn get_projects() -> Vec<Project> {
    storage::get_projects()
}

#[tauri::command]
fn save_project(project: Project) -> Result<(), String> {
    storage::save_project(&project).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_project(project_id: String) -> Option<Project> {
    storage::load_project(&project_id)
}

#[tauri::command]
fn delete_project(project_id: String) -> Result<(), String> {
    storage::delete_project(&project_id).map_err(|e| e.to_string())
}

// --- Project Thread Commands ---
#[tauri::command]
fn get_project_threads(project_id: String) -> Vec<Session> {
    storage::get_project_threads(&project_id)
}

#[tauri::command]
fn save_project_thread(project_id: String, session: Session) -> Result<(), String> {
    storage::save_project_thread(&project_id, &session).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project_thread(project_id: String, session_id: String) -> Result<(), String> {
    storage::delete_project_thread(&project_id, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_project_thread(project_id: String, session_id: String) -> Option<Session> {
    storage::load_project_thread(&project_id, &session_id)
}

// --- Project Memory Commands ---
#[tauri::command]
fn get_project_memories(project_id: String) -> Vec<MemoryItem> {
    storage::get_project_memories(&project_id)
}

#[tauri::command]
fn save_memory(project_id: String, item: MemoryItem) -> Result<(), String> {
    storage::save_memory_item(&project_id, &item).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_memory(project_id: String, memory_id: String) -> Result<(), String> {
    storage::delete_memory_item(&project_id, &memory_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_memory(project_id: String, memory_id: String) -> Option<MemoryItem> {
    storage::load_memory_item(&project_id, &memory_id)
}

#[tauri::command]
fn update_memory_status(project_id: String, memory_id: String, status: String) -> Result<(), String> {
    storage::update_memory_status(&project_id, &memory_id, &status).map_err(|e| e.to_string())
}

// --- File Operations ---
#[tauri::command]
fn read_file(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(file_path: String, content: String) -> Result<(), String> {
    std::fs::write(&file_path, &content).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    name: String,
    is_directory: bool,
    path: String,
}

#[tauri::command]
fn list_files(dir_path: String) -> Result<Vec<FileEntry>, String> {
    let entries = std::fs::read_dir(&dir_path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        files.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            path: entry.path().to_string_lossy().to_string(),
        });
    }
    Ok(files)
}

#[tauri::command]
fn get_cwd() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitFile {
    path: String,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BranchList {
    current: String,
    branches: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatus {
    is_repo: bool,
    branch: String,
    staged: Vec<GitFile>,
    unstaged: Vec<GitFile>,
    ahead: i32,
    behind: i32,
    staged_additions: i64,
    staged_deletions: i64,
    unstaged_additions: i64,
    unstaged_deletions: i64,
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).args(args);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn run_git_args(repo_path: &str, args: &[String]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).args(args);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn null_device() -> &'static str {
    if cfg!(windows) {
        "NUL"
    } else {
        "/dev/null"
    }
}

fn parse_numstat(output: &str) -> (i64, i64) {
    let mut additions = 0i64;
    let mut deletions = 0i64;
    for line in output.lines() {
        let mut parts = line.split('\t');
        let add = parts.next().unwrap_or("0");
        let del = parts.next().unwrap_or("0");
        let add_val = add.parse::<i64>().unwrap_or(0);
        let del_val = del.parse::<i64>().unwrap_or(0);
        additions += add_val;
        deletions += del_val;
    }
    (additions, deletions)
}

fn status_to_label(status: char) -> String {
    match status {
        'M' => "modified",
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        'U' => "conflict",
        _ => "changed",
    }
    .to_string()
}

fn normalize_path(path: &str) -> String {
    if let Some(idx) = path.rfind("->") {
        return path[idx + 2..].trim().to_string();
    }
    path.trim().to_string()
}

#[tauri::command]
fn git_status(repo_path: String) -> Result<GitStatus, String> {
    let inside = run_git(&repo_path, &["rev-parse", "--is-inside-work-tree"]);
    if inside.is_err() {
        return Ok(GitStatus {
            is_repo: false,
            branch: String::new(),
            staged: vec![],
            unstaged: vec![],
            ahead: 0,
            behind: 0,
            staged_additions: 0,
            staged_deletions: 0,
            unstaged_additions: 0,
            unstaged_deletions: 0,
        });
    }

    let branch = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "unknown".to_string())
        .trim()
        .to_string();

    let status_output = run_git(&repo_path, &["status", "--porcelain=1", "-b"])?;
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut ahead = 0i32;
    let mut behind = 0i32;

    for line in status_output.lines() {
        if line.starts_with("## ") {
            if let Some(idx) = line.find('[') {
                let meta = &line[idx + 1..line.len() - 1];
                for part in meta.split(',') {
                    let trimmed = part.trim();
                    if let Some(val) = trimmed.strip_prefix("ahead ") {
                        ahead = val.parse::<i32>().unwrap_or(0);
                    }
                    if let Some(val) = trimmed.strip_prefix("behind ") {
                        behind = val.parse::<i32>().unwrap_or(0);
                    }
                }
            }
            continue;
        }
        if line.len() < 3 {
            continue;
        }
        let mut chars = line.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');
        let path = normalize_path(line[3..].trim());

        if x == '?' && y == '?' {
            unstaged.push(GitFile {
                path,
                status: "untracked".to_string(),
            });
            continue;
        }

        if x != ' ' {
            staged.push(GitFile {
                path: path.clone(),
                status: status_to_label(x),
            });
        }
        if y != ' ' {
            unstaged.push(GitFile {
                path: path.clone(),
                status: status_to_label(y),
            });
        }
    }

    let staged_numstat = run_git(&repo_path, &["diff", "--numstat", "--staged"])
        .unwrap_or_default();
    let unstaged_numstat = run_git(&repo_path, &["diff", "--numstat"]).unwrap_or_default();
    let (staged_additions, staged_deletions) = parse_numstat(&staged_numstat);
    let (unstaged_additions, unstaged_deletions) = parse_numstat(&unstaged_numstat);

    Ok(GitStatus {
        is_repo: true,
        branch,
        staged,
        unstaged,
        ahead,
        behind,
        staged_additions,
        staged_deletions,
        unstaged_additions,
        unstaged_deletions,
    })
}

#[tauri::command]
fn git_stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    run_git(&repo_path, &["add", "--", &file_path]).map(|_| ())
}

#[tauri::command]
fn git_unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    run_git(&repo_path, &["restore", "--staged", "--", &file_path]).map(|_| ())
}

#[tauri::command]
fn git_discard_file(repo_path: String, file_path: String, is_untracked: bool) -> Result<(), String> {
    if is_untracked {
        run_git(&repo_path, &["clean", "-f", "--", &file_path]).map(|_| ())
    } else {
        run_git(&repo_path, &["checkout", "--", &file_path]).map(|_| ())
    }
}

#[tauri::command]
fn git_stage_all(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["add", "-A"]).map(|_| ())
}

#[tauri::command]
fn git_unstage_all(repo_path: String) -> Result<(), String> {
    run_git(&repo_path, &["restore", "--staged", "."]).map(|_| ())
}

#[tauri::command]
fn git_commit(
    repo_path: String,
    message: String,
    include_unstaged: bool,
    push: bool,
) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Commit message is required".to_string());
    }
    if include_unstaged {
        run_git(&repo_path, &["add", "-A"])?;
    }
    run_git(&repo_path, &["commit", "-m", &message])?;
    if push {
        run_git(&repo_path, &["push"])?;
    }
    Ok(())
}

#[tauri::command]
fn git_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
    is_new: bool,
) -> Result<String, String> {
    let mut args: Vec<String> = vec!["diff".into()];
    if staged {
        args.push("--staged".into());
    }
    if is_new && !staged {
        args.push("--no-index".into());
        args.push("--".into());
        args.push(null_device().into());
        args.push(file_path);
    } else {
        args.push("--".into());
        args.push(file_path);
    }
    let output = run_git_args(&repo_path, &args)?;
    if output.trim().is_empty() {
        Ok("No diff available.".to_string())
    } else {
        Ok(output)
    }
}

#[tauri::command]
fn git_list_branches(repo_path: String) -> Result<BranchList, String> {
    let current = run_git(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "unknown".to_string())
        .trim()
        .to_string();

    let output = run_git(&repo_path, &["branch", "--list", "--format=%(refname:short)"])?;
    let branches: Vec<String> = output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(BranchList { current, branches })
}

#[tauri::command]
fn git_create_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    if branch_name.trim().is_empty() {
        return Err("Branch name cannot be empty".to_string());
    }
    run_git(&repo_path, &["checkout", "-b", branch_name.trim()]).map(|_| ())
}

#[tauri::command]
fn git_switch_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    run_git(&repo_path, &["checkout", &branch_name]).map(|_| ())
}

// --- OpenCode CLI ---
#[tauri::command]
fn check_opencode() -> Result<String, String> {
    opencode::check_opencode()
}

#[tauri::command]
async fn send_opencode(
    app: tauri::AppHandle,
    state: tauri::State<'_, opencode::OpenCodeState>,
    request: OpenCodeRequest,
) -> Result<(), String> {
    opencode::run_opencode(
        app,
        &state,
        request.prompt,
        request.project_dir,
        request.session_id,
        &request.settings,
    )
    .await
}

#[tauri::command]
async fn cancel_opencode(state: tauri::State<'_, opencode::OpenCodeState>, session_id: String) -> Result<(), String> {
    opencode::cancel_opencode(&state, &session_id).await;
    Ok(())
}

// --- Fetch Models (provider-aware) ---
#[derive(Serialize)]
struct ModelInfo {
    id: String,
    name: String,
}

async fn fetch_openai_models(api_key: String) -> Result<Vec<ModelInfo>, String> {
    if api_key.is_empty() {
        return Err("OpenAI API key not set".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get("https://api.openai.com/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<ModelInfo> = Vec::new();

    let exclude_keywords = [
        "audio", "realtime", "tts", "transcribe", "search", "image",
        "dall-e", "whisper", "embedding", "moderation", "sora",
        "babbage", "davinci", "instruct", "diarize",
    ];

    if let Some(data) = body["data"].as_array() {
        for model in data {
            if let Some(id) = model["id"].as_str() {
                if id.starts_with("ft:") { continue; }
                if id.contains("-2024-") || id.contains("-2025-") { continue; }
                let is_chat_family = id.starts_with("gpt-")
                    || id.starts_with("o1")
                    || id.starts_with("o3")
                    || id.starts_with("o4")
                    || id.starts_with("chatgpt")
                    || id.starts_with("codex-");
                if !is_chat_family { continue; }
                if exclude_keywords.iter().any(|kw| id.contains(kw)) { continue; }
                if id.ends_with("-chat-latest") { continue; }
                models.push(ModelInfo { id: id.to_string(), name: id.to_string() });
            }
        }
    }

    models.sort_by(|a, b| {
        fn rank(id: &str) -> u8 {
            if id.starts_with("o4") { return 0; }
            if id.starts_with("o3-pro") { return 1; }
            if id.starts_with("o3-mini") { return 3; }
            if id.starts_with("o3") { return 2; }
            if id.starts_with("o1-pro") { return 4; }
            if id.starts_with("o1") { return 5; }
            if id.starts_with("gpt-5.2") { return 10; }
            if id.starts_with("gpt-5.1") { return 11; }
            if id.starts_with("gpt-5-pro") { return 12; }
            if id.starts_with("gpt-5-nano") { return 15; }
            if id.starts_with("gpt-5-mini") { return 14; }
            if id.starts_with("gpt-5") { return 13; }
            if id.starts_with("gpt-4o-mini") { return 21; }
            if id.starts_with("gpt-4o") { return 20; }
            if id.starts_with("gpt-4.1-nano") { return 24; }
            if id.starts_with("gpt-4.1-mini") { return 23; }
            if id.starts_with("gpt-4.1") { return 22; }
            if id.starts_with("gpt-3") { return 30; }
            if id.starts_with("codex") { return 40; }
            50
        }
        rank(&a.id).cmp(&rank(&b.id))
    });
    Ok(models)
}

fn get_anthropic_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo { id: "claude-opus-4-20250514".into(), name: "Claude Opus 4".into() },
        ModelInfo { id: "claude-sonnet-4-5-20250929".into(), name: "Claude Sonnet 4.5".into() },
        ModelInfo { id: "claude-sonnet-4-20250514".into(), name: "Claude Sonnet 4".into() },
        ModelInfo { id: "claude-haiku-4-5-20251001".into(), name: "Claude Haiku 4.5".into() },
        ModelInfo { id: "claude-3-5-sonnet-20241022".into(), name: "Claude 3.5 Sonnet".into() },
        ModelInfo { id: "claude-3-5-haiku-20241022".into(), name: "Claude 3.5 Haiku".into() },
    ]
}

async fn fetch_gemini_models(api_key: String) -> Result<Vec<ModelInfo>, String> {
    if api_key.is_empty() {
        return Err("Gemini API key not set".to_string());
    }

    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Gemini API error: {}", response.status()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<ModelInfo> = Vec::new();

    if let Some(data) = body["models"].as_array() {
        for model in data {
            let name = model["name"].as_str().unwrap_or("");
            let display = model["displayName"].as_str().unwrap_or(name);
            // Only include models that support generateContent
            let methods = model["supportedGenerationMethods"].as_array();
            let supports_generate = methods
                .map(|m| m.iter().any(|v| v.as_str() == Some("generateContent")))
                .unwrap_or(false);
            if !supports_generate { continue; }
            // Strip "models/" prefix
            let id = name.strip_prefix("models/").unwrap_or(name);
            if id.is_empty() { continue; }
            models.push(ModelInfo { id: id.to_string(), name: display.to_string() });
        }
    }

    // Sort: gemini-2.x first, then 1.5, then rest
    models.sort_by(|a, b| {
        fn rank(id: &str) -> u8 {
            if id.contains("2.5") { return 0; }
            if id.contains("2.0") { return 1; }
            if id.contains("1.5-pro") { return 2; }
            if id.contains("1.5") { return 3; }
            10
        }
        rank(&a.id).cmp(&rank(&b.id))
    });
    Ok(models)
}

async fn fetch_azure_openai_models(api_key: String, endpoint: String) -> Result<Vec<ModelInfo>, String> {
    if api_key.is_empty() || endpoint.is_empty() {
        return Err("Azure OpenAI API key and endpoint are required".to_string());
    }

    let base = endpoint.trim_end_matches('/');
    let url = format!("{}/openai/deployments?api-version=2024-10-21", base);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("api-key", &api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Azure API error: {}", response.status()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<ModelInfo> = Vec::new();

    if let Some(data) = body["data"].as_array() {
        for deployment in data {
            let id = deployment["id"].as_str().unwrap_or("");
            let model_name = deployment["model"].as_str().unwrap_or(id);
            if id.is_empty() { continue; }
            models.push(ModelInfo {
                id: id.to_string(),
                name: format!("{} ({})", id, model_name),
            });
        }
    }

    if models.is_empty() {
        return Err("No deployments found. Make sure you have models deployed in Azure.".to_string());
    }

    Ok(models)
}

#[tauri::command]
async fn fetch_provider_models(
    provider: String,
    api_key: String,
    endpoint: String,
) -> Result<Vec<ModelInfo>, String> {
    match provider.as_str() {
        "openai" => fetch_openai_models(api_key).await,
        "anthropic" => Ok(get_anthropic_models()),
        "gemini" => fetch_gemini_models(api_key).await,
        "azure" => fetch_azure_openai_models(api_key, endpoint).await,
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

// --- Generate Commit Message ---
#[tauri::command]
async fn generate_commit_message(
    repo_path: String,
    include_unstaged: bool,
    settings: Settings,
) -> Result<String, String> {
    // Gather the diff
    let staged_diff = run_git(&repo_path, &["diff", "--staged"]).unwrap_or_default();
    let unstaged_diff = if include_unstaged {
        run_git(&repo_path, &["diff"]).unwrap_or_default()
    } else {
        String::new()
    };

    // Also get untracked file names if including unstaged
    let untracked = if include_unstaged {
        run_git(&repo_path, &["ls-files", "--others", "--exclude-standard"]).unwrap_or_default()
    } else {
        String::new()
    };

    let mut diff_context = String::new();
    if !staged_diff.trim().is_empty() {
        diff_context.push_str("=== Staged Changes ===\n");
        diff_context.push_str(&staged_diff);
        diff_context.push('\n');
    }
    if !unstaged_diff.trim().is_empty() {
        diff_context.push_str("=== Unstaged Changes ===\n");
        diff_context.push_str(&unstaged_diff);
        diff_context.push('\n');
    }
    if !untracked.trim().is_empty() {
        diff_context.push_str("=== New Untracked Files ===\n");
        diff_context.push_str(&untracked);
        diff_context.push('\n');
    }

    if diff_context.trim().is_empty() {
        return Err("No changes to generate a commit message for.".to_string());
    }

    // Truncate very large diffs to avoid token limits
    let max_len = 12000;
    if diff_context.len() > max_len {
        diff_context.truncate(max_len);
        diff_context.push_str("\n... (diff truncated)");
    }

    let prompt = format!(
        "Based on the following git diff, write a concise commit message. \
         Use conventional commit format (e.g. feat:, fix:, refactor:, docs:, chore:). \
         First line should be under 72 characters. Add a blank line then a brief body if needed. \
         Output ONLY the commit message, nothing else.\n\n{}",
        diff_context
    );

    // Make a non-streaming LLM call based on provider
    let client = reqwest::Client::new();

    match settings.provider.as_str() {
        "anthropic" => {
            let api_key = if !settings.anthropic_api_key.is_empty() {
                settings.anthropic_api_key.clone()
            } else {
                std::env::var("ANTHROPIC_API_KEY").unwrap_or_default()
            };
            if api_key.is_empty() {
                return Err("Anthropic API key not set.".to_string());
            }
            let model = if settings.model.is_empty() { "claude-sonnet-4-5-20250929".to_string() } else { settings.model.clone() };
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 256,
                "messages": [{"role": "user", "content": prompt}]
            });
            let resp = client.post("https://api.anthropic.com/v1/messages")
                .header("Content-Type", "application/json")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&body).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                let err = resp.text().await.unwrap_or_default();
                return Err(format!("Anthropic API error: {}", err));
            }
            let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(json["content"][0]["text"].as_str().unwrap_or("").trim().to_string())
        }
        "gemini" => {
            let api_key = if !settings.gemini_api_key.is_empty() {
                settings.gemini_api_key.clone()
            } else {
                std::env::var("GEMINI_API_KEY").unwrap_or_default()
            };
            if api_key.is_empty() {
                return Err("Gemini API key not set.".to_string());
            }
            let model = if settings.model.is_empty() { "gemini-2.0-flash".to_string() } else { settings.model.clone() };
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                model, api_key
            );
            let body = serde_json::json!({
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": 256}
            });
            let resp = client.post(&url)
                .header("Content-Type", "application/json")
                .json(&body).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                let err = resp.text().await.unwrap_or_default();
                return Err(format!("Gemini API error: {}", err));
            }
            let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(json["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").trim().to_string())
        }
        "azure" => {
            let api_key = if !settings.azure_openai_api_key.is_empty() {
                settings.azure_openai_api_key.clone()
            } else {
                std::env::var("AZURE_OPENAI_API_KEY").unwrap_or_default()
            };
            let endpoint = if !settings.azure_openai_endpoint.is_empty() {
                settings.azure_openai_endpoint.clone()
            } else {
                std::env::var("AZURE_OPENAI_ENDPOINT").unwrap_or_default()
            };
            if api_key.is_empty() || endpoint.is_empty() {
                return Err("Azure OpenAI API key and endpoint not set.".to_string());
            }
            let deployment = if settings.model.is_empty() { "gpt-4.1".to_string() } else { settings.model.clone() };
            let base = endpoint.trim_end_matches('/');
            let url = format!("{}/openai/deployments/{}/chat/completions?api-version=2024-10-21", base, deployment);
            let body = serde_json::json!({
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant that writes git commit messages."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 256
            });
            let resp = client.post(&url)
                .header("Content-Type", "application/json")
                .header("api-key", &api_key)
                .json(&body).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                let err = resp.text().await.unwrap_or_default();
                return Err(format!("Azure API error: {}", err));
            }
            let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(json["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_string())
        }
        _ => {
            // OpenAI (default)
            let api_key = if !settings.openai_api_key.is_empty() {
                settings.openai_api_key.clone()
            } else {
                std::env::var("OPENAI_API_KEY").unwrap_or_default()
            };
            if api_key.is_empty() {
                return Err("OpenAI API key not set.".to_string());
            }
            let model = if settings.model.is_empty() { "gpt-4.1".to_string() } else { settings.model.clone() };
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant that writes git commit messages."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 256
            });
            let resp = client.post("https://api.openai.com/v1/chat/completions")
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&body).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                let err = resp.text().await.unwrap_or_default();
                return Err(format!("OpenAI API error: {}", err));
            }
            let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(json["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_string())
        }
    }
}

// --- LLM Streaming (direct API, kept as fallback) ---
#[tauri::command]
async fn send_message(app: tauri::AppHandle, request: StreamRequest) -> Result<(), String> {
    let settings = request.settings;
    let messages = request.messages;

    match settings.provider.as_str() {
        "openai" => llm::stream_openai(app, messages, &settings).await,
        "anthropic" => llm::stream_anthropic(app, messages, &settings).await,
        "gemini" => llm::stream_gemini(app, messages, &settings).await,
        "azure" => llm::stream_azure_openai(app, messages, &settings).await,
        _ => Err(format!("Unknown provider: {}", settings.provider)),
    }
}

#[tauri::command]
async fn cancel_stream(state: tauri::State<'_, llm::StreamState>) -> Result<(), String> {
    llm::cancel_current_stream(&state).await;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(llm::StreamState::default())
        .manage(opencode::OpenCodeState::default())
        .manage(terminal::TerminalState::default())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            get_projects,
            save_project,
            load_project,
            delete_project,
            get_project_threads,
            save_project_thread,
            delete_project_thread,
            load_project_thread,
            get_project_memories,
            save_memory,
            delete_memory,
            load_memory,
            update_memory_status,
            read_file,
            write_file,
            list_files,
            get_cwd,
            check_opencode,
            send_opencode,
            cancel_opencode,
            send_message,
            cancel_stream,
            fetch_provider_models,
            git_status,
            git_stage_file,
            git_unstage_file,
            git_discard_file,
            git_stage_all,
            git_unstage_all,
            git_commit,
            git_diff,
            generate_commit_message,
            git_list_branches,
            git_create_branch,
            git_switch_branch,
            terminal::terminal_start,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
