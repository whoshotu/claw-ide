// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;
mod opencode;
mod storage;

use serde::{Deserialize, Serialize};
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
