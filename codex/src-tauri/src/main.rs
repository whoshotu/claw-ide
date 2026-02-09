// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;
mod opencode;
mod storage;
mod terminal;

use serde::{Deserialize, Serialize};
use std::process::Command;
use storage::{Project, Session, Settings};

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
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn run_git_args(repo_path: &str, args: &[String]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
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
async fn cancel_opencode(state: tauri::State<'_, opencode::OpenCodeState>) -> Result<(), String> {
    opencode::cancel_opencode(&state).await;
    Ok(())
}

// --- Fetch Models from OpenAI ---
#[derive(Serialize)]
struct ModelInfo {
    id: String,
    name: String,
}

#[tauri::command]
async fn fetch_models(api_key: String) -> Result<Vec<ModelInfo>, String> {
    let key = if !api_key.is_empty() {
        api_key
    } else {
        std::env::var("OPENAI_API_KEY").unwrap_or_default()
    };

    if key.is_empty() {
        return Err("API key not set".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get("https://api.openai.com/v1/models")
        .header("Authorization", format!("Bearer {}", key))
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
                if id.starts_with("ft:") {
                    continue;
                }
                if id.contains("-2024-") || id.contains("-2025-") {
                    continue;
                }
                let is_chat_family = id.starts_with("gpt-")
                    || id.starts_with("o1")
                    || id.starts_with("o3")
                    || id.starts_with("o4")
                    || id.starts_with("chatgpt")
                    || id.starts_with("codex-");
                if !is_chat_family {
                    continue;
                }
                let is_excluded = exclude_keywords.iter().any(|kw| id.contains(kw));
                if is_excluded {
                    continue;
                }
                if id.ends_with("-chat-latest") {
                    continue;
                }
                models.push(ModelInfo {
                    id: id.to_string(),
                    name: id.to_string(),
                });
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

// --- LLM Streaming (direct API, kept as fallback) ---
#[tauri::command]
async fn send_message(app: tauri::AppHandle, request: StreamRequest) -> Result<(), String> {
    let settings = request.settings;
    let messages = request.messages;

    match settings.provider.as_str() {
        "openai" => llm::stream_openai(app, messages, &settings).await,
        "anthropic" => llm::stream_anthropic(app, messages, &settings).await,
        "gemini" => llm::stream_gemini(app, messages, &settings).await,
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
            read_file,
            write_file,
            list_files,
            get_cwd,
            check_opencode,
            send_opencode,
            cancel_opencode,
            send_message,
            cancel_stream,
            fetch_models,
            git_status,
            git_stage_file,
            git_unstage_file,
            git_discard_file,
            git_stage_all,
            git_unstage_all,
            git_commit,
            git_diff,
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
