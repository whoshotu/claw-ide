use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::ChatMessage;

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
    pub effort: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            model: "gpt-4o".to_string(),
            openai_api_key: String::new(),
            anthropic_api_key: String::new(),
            gemini_api_key: String::new(),
            effort: "high".to_string(),
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

fn data_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("codex-app")
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
                return settings;
            }
        }
    }
    let mut settings = Settings::default();
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        settings.openai_api_key = key;
    }
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        settings.anthropic_api_key = key;
    }
    if let Ok(key) = std::env::var("GEMINI_API_KEY") {
        settings.gemini_api_key = key;
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
