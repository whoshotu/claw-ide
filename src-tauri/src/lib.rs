mod commands;

use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use std::path::PathBuf;

fn get_log_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(app_data).join("claw-ide").join("logs")
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join("Library").join("Logs").join("claw-ide")
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join(".local").join("share").join("claw-ide").join("logs")
    }
}

fn setup_logging() {
    let log_dir = get_log_dir();
    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&log_dir, "claw-ide.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::registry()
        .with(EnvFilter::new("info"))
        .with(fmt::layer().with_writer(non_blocking))
        .with(fmt::layer().with_writer(std::io::stderr))
        .init();

    tracing::info!("Claw IDE starting up");

    // Set up panic handler
    std::panic::set_hook(Box::new(|panic_info| {
        let log_dir = get_log_dir();
        let crash_file = log_dir.join(format!(
            "crash-{}.json",
            chrono::Utc::now().format("%Y%m%d-%H%M%S")
        ));
        let crash_data = serde_json::json!({
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "panic": panic_info.to_string(),
            "version": env!("CARGO_PKG_VERSION"),
        });
        std::fs::write(&crash_file, crash_data.to_string()).ok();
        tracing::error!("Panic: {}", panic_info);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_current_directory,
            commands::read_directory,
            commands::read_file,
            commands::write_file,
            commands::find_claw_binary,
            commands::check_claw_version,
            commands::spawn_claw,
            commands::kill_claw_process,
            commands::spawn_openclaw,
            commands::find_openclaw_gateway,
        ])
        .setup(|app| {
            tracing::info!("Tauri app setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
