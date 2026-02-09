use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct TerminalSession {
    cwd: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExit {
    session_id: String,
}

fn resolve_cwd(cwd: String) -> PathBuf {
    if !cwd.trim().is_empty() {
        let path = PathBuf::from(&cwd);
        if path.exists() && path.is_dir() {
            return path;
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg(windows)]
fn default_shell() -> (String, Vec<String>) {
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
    (shell, vec![])
}

#[cfg(not(windows))]
fn default_shell() -> (String, Vec<String>) {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let shell_name = shell.rsplit('/').next().unwrap_or("");
    let mut args = Vec::new();
    if shell_name == "bash" || shell_name == "zsh" {
        args.push("-l".to_string());
    }
    (shell, args)
}

#[tauri::command]
pub fn terminal_start(
    app: AppHandle,
    state: State<'_, TerminalState>,
    session_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Err("Missing terminal session id".to_string());
    }

    let cols = cols.max(1);
    let rows = rows.max(1);

    {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Terminal state lock poisoned".to_string())?;
        if let Some(existing) = sessions.get_mut(&session_id) {
            if existing.cwd == cwd {
                let _ = existing.master.resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                });
                return Ok(());
            }
        }
        if let Some(mut existing) = sessions.remove(&session_id) {
            let _ = existing.child.kill();
        }
    }

    let cwd_path = resolve_cwd(cwd.clone());
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let (shell, args) = default_shell();
    let mut cmd = CommandBuilder::new(shell);
    cmd.cwd(cwd_path);
    cmd.env("TERM", "xterm-256color");
    for arg in args {
        cmd.arg(arg);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let master = pair.master;

    let app_handle = app.clone();
    let session_for_thread = session_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let _ = app_handle.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: session_for_thread.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit(
            "terminal-exit",
            TerminalExit {
                session_id: session_for_thread,
            },
        );
    });

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?;
    sessions.insert(
        session_id,
        TerminalSession {
            cwd,
            master,
            writer,
            child,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn terminal_write(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_stop(state: State<'_, TerminalState>, session_id: String) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?;
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.child.kill();
    }
    Ok(())
}
