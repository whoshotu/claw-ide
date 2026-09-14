use std::path::PathBuf;
use tauri::command;

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
        result.push(serde_json::json!({
            "name": entry.file_name().to_string_lossy(),
            "is_dir": meta.is_dir(),
            "path": entry.path().to_string_lossy()
        }));
    }
    Ok(result)
}

#[command]
pub async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[command]
pub async fn find_claw_binary() -> Result<String, String> {
    let candidates = vec![
        "/usr/local/bin/claw",
        "/usr/bin/claw",
        "./claw",
    ];
    for path in candidates {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }
    Err("claw binary not found".to_string())
}

#[command]
pub async fn check_claw_version() -> Result<String, String> {
    let output = std::process::Command::new("claw")
        .arg("--version")
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[command]
pub async fn spawn_claw(args: Vec<String>) -> Result<u32, String> {
    let child = std::process::Command::new("claw")
        .args(&args)
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
    let child = std::process::Command::new("openclaw")
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(child.id())
}

#[command]
pub async fn find_openclaw_gateway() -> Result<String, String> {
    let candidates = vec![
        "/usr/local/bin/openclaw",
        "/usr/bin/openclaw",
        "./openclaw",
    ];
    for path in candidates {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }
    Err("openclaw gateway not found".to_string())
}
