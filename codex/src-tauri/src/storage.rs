use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::ChatMessage;

fn default_effort() -> String {
    "high".to_string()
}

fn default_verbosity() -> String {
    "medium".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub openai_api_key: String,
    #[serde(default)]
    pub anthropic_api_key: String,
    #[serde(default)]
    pub gemini_api_key: String,
    #[serde(default)]
    pub azure_openai_api_key: String,
    #[serde(default)]
    pub azure_openai_endpoint: String,
    #[serde(default = "default_effort")]
    pub effort: String,
    #[serde(default = "default_verbosity")]
    pub verbosity: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            model: "gpt-4.1".to_string(),
            openai_api_key: String::new(),
            anthropic_api_key: String::new(),
            gemini_api_key: String::new(),
            azure_openai_api_key: String::new(),
            azure_openai_endpoint: String::new(),
            effort: default_effort(),
            verbosity: default_verbosity(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub directory: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: String,
    pub messages: Vec<ChatMessage>,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub project_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemoryItem {
    pub id: String,
    pub project_id: String,
    #[serde(default)]
    pub memory_type: String,
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default = "default_priority")]
    pub priority: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub source_ref: String,
    // Mistake-specific fields
    #[serde(default)]
    pub symptoms: String,
    #[serde(default)]
    pub root_cause: String,
    #[serde(default)]
    pub fix_pattern: String,
    #[serde(default)]
    pub files_involved: Vec<String>,
    #[serde(default)]
    pub prevention_checklist: Vec<String>,
}

fn default_status() -> String {
    "approved".to_string()
}

fn default_priority() -> String {
    "medium".to_string()
}

fn data_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("opencodex-app")
}

fn settings_file() -> PathBuf {
    data_dir().join("settings.json")
}

fn projects_dir() -> PathBuf {
    data_dir().join("projects")
}

fn project_meta_file(project_id: &str) -> PathBuf {
    projects_dir().join(project_id).join("project.json")
}

fn project_threads_dir(project_id: &str) -> PathBuf {
    projects_dir().join(project_id).join("threads")
}

fn ensure_base_dirs() {
    let _ = fs::create_dir_all(data_dir());
    let _ = fs::create_dir_all(projects_dir());
}

fn ensure_project_dirs(project_id: &str) {
    let _ = fs::create_dir_all(projects_dir().join(project_id));
    let _ = fs::create_dir_all(project_threads_dir(project_id));
}

// --- Settings ---
pub fn load_settings() -> Settings {
    let path = settings_file();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return merge_env_settings(settings);
            }
        }
    }
    merge_env_settings(Settings::default())
}

fn merge_env_settings(mut settings: Settings) -> Settings {
    if settings.openai_api_key.is_empty() {
        if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            settings.openai_api_key = key;
        }
    }
    if settings.anthropic_api_key.is_empty() {
        if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
            settings.anthropic_api_key = key;
        }
    }
    if settings.gemini_api_key.is_empty() {
        if let Ok(key) = std::env::var("GEMINI_API_KEY") {
            settings.gemini_api_key = key;
        }
    }
    if settings.azure_openai_api_key.is_empty() {
        if let Ok(key) = std::env::var("AZURE_OPENAI_API_KEY") {
            settings.azure_openai_api_key = key;
        }
    }
    if settings.azure_openai_endpoint.is_empty() {
        if let Ok(endpoint) = std::env::var("AZURE_OPENAI_ENDPOINT") {
            settings.azure_openai_endpoint = endpoint;
        }
    }
    settings
}

pub fn save_settings(settings: &Settings) -> Result<(), Box<dyn std::error::Error>> {
    ensure_base_dirs();
    let content = serde_json::to_string_pretty(settings)?;
    fs::write(settings_file(), content)?;
    Ok(())
}

// --- Projects ---
pub fn get_projects() -> Vec<Project> {
    ensure_base_dirs();
    let dir = projects_dir();
    let mut projects: Vec<Project> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let meta = entry.path().join("project.json");
                if let Ok(content) = fs::read_to_string(&meta) {
                    if let Ok(project) = serde_json::from_str::<Project>(&content) {
                        projects.push(project);
                    }
                }
            }
        }
    }
    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    projects
}

pub fn save_project(project: &Project) -> Result<(), Box<dyn std::error::Error>> {
    ensure_project_dirs(&project.id);
    let content = serde_json::to_string_pretty(project)?;
    fs::write(project_meta_file(&project.id), content)?;
    Ok(())
}

pub fn load_project(project_id: &str) -> Option<Project> {
    let path = project_meta_file(project_id);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            return serde_json::from_str(&content).ok();
        }
    }
    None
}

pub fn delete_project(project_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let path = projects_dir().join(project_id);
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

// --- Project Threads ---
pub fn get_project_threads(project_id: &str) -> Vec<Session> {
    ensure_project_dirs(project_id);
    let dir = project_threads_dir(project_id);
    let mut threads: Vec<Session> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(session) = serde_json::from_str::<Session>(&content) {
                        threads.push(session);
                    }
                }
            }
        }
    }
    threads.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    threads
}

pub fn save_project_thread(project_id: &str, session: &Session) -> Result<(), Box<dyn std::error::Error>> {
    ensure_project_dirs(project_id);
    let path = project_threads_dir(project_id).join(format!("{}.json", session.id));
    let content = serde_json::to_string_pretty(session)?;
    fs::write(path, content)?;
    Ok(())
}

pub fn delete_project_thread(project_id: &str, session_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let path = project_threads_dir(project_id).join(format!("{}.json", session_id));
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn load_project_thread(project_id: &str, session_id: &str) -> Option<Session> {
    let path = project_threads_dir(project_id).join(format!("{}.json", session_id));
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            return serde_json::from_str(&content).ok();
        }
    }
    None
}

// --- Project Memory ---
fn memory_dir(project_id: &str) -> PathBuf {
    projects_dir().join(project_id).join("memory")
}

fn ensure_memory_dir(project_id: &str) {
    let _ = fs::create_dir_all(memory_dir(project_id));
}

pub fn get_project_memories(project_id: &str) -> Vec<MemoryItem> {
    ensure_memory_dir(project_id);
    let dir = memory_dir(project_id);
    let mut items: Vec<MemoryItem> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(item) = serde_json::from_str::<MemoryItem>(&content) {
                        items.push(item);
                    }
                }
            }
        }
    }
    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    items
}

pub fn save_memory_item(project_id: &str, item: &MemoryItem) -> Result<(), Box<dyn std::error::Error>> {
    ensure_memory_dir(project_id);
    let path = memory_dir(project_id).join(format!("{}.json", item.id));
    let content = serde_json::to_string_pretty(item)?;
    fs::write(path, content)?;
    Ok(())
}

pub fn load_memory_item(project_id: &str, memory_id: &str) -> Option<MemoryItem> {
    let path = memory_dir(project_id).join(format!("{}.json", memory_id));
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            return serde_json::from_str(&content).ok();
        }
    }
    None
}

pub fn delete_memory_item(project_id: &str, memory_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let path = memory_dir(project_id).join(format!("{}.json", memory_id));
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn update_memory_status(project_id: &str, memory_id: &str, status: &str) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(mut item) = load_memory_item(project_id, memory_id) {
        item.status = status.to_string();
        item.updated_at = chrono::Utc::now().timestamp_millis();
        save_memory_item(project_id, &item)?;
    }
    Ok(())
}
