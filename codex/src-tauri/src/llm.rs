use crate::storage::Settings;
use crate::ChatMessage;
use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

fn openai_supports_verbosity(model: &str) -> bool {
    model.starts_with("gpt-5")
}

fn openai_use_responses_api(model: &str) -> bool {
    model.starts_with("gpt-5")
}

fn extract_response_output_text(parsed: &serde_json::Value) -> Option<String> {
    let response = parsed.get("response")?;
    let output = response.get("output")?.as_array()?;
    let mut text = String::new();
    for item in output {
        if item.get("type").and_then(|v| v.as_str()) != Some("message") {
            continue;
        }
        if let Some(content) = item.get("content").and_then(|v| v.as_array()) {
            for part in content {
                if part.get("type").and_then(|v| v.as_str()) == Some("output_text") {
                    if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                        text.push_str(t);
                    }
                }
            }
        }
    }
    if text.is_empty() { None } else { Some(text) }
}

/// Per-model supported reasoning effort levels (from OpenAI docs).
fn supported_efforts(model: &str) -> Option<&'static [&'static str]> {
    // Exact prefix matching, longest first
    let table: &[(&str, &[&str])] = &[
        ("gpt-5.2-pro",       &["medium", "high", "xhigh"]),
        ("gpt-5.2-codex",     &["low", "medium", "high", "xhigh"]),
        ("gpt-5.2",           &["none", "low", "medium", "high", "xhigh"]),
        ("gpt-5.1-codex-max", &["low", "medium", "high", "xhigh"]),
        ("gpt-5.1-codex-mini",&["low", "medium", "high"]),
        ("gpt-5.1-codex",     &["low", "medium", "high"]),
        ("gpt-5.1",           &["none", "low", "medium", "high"]),
        ("gpt-5-pro",         &["high"]),
        ("gpt-5-codex",       &["low", "medium", "high"]),
        ("gpt-5-mini",        &["minimal", "low", "medium", "high"]),
        ("gpt-5-nano",        &["minimal", "low", "medium", "high"]),
        ("gpt-5",             &["minimal", "low", "medium", "high"]),
        ("o1",                &["low", "medium", "high"]),
        ("o3",                &["low", "medium", "high"]),
        ("o4",                &["low", "medium", "high"]),
    ];
    for (prefix, efforts) in table {
        if model.starts_with(prefix) {
            return Some(efforts);
        }
    }
    None
}

fn normalize_reasoning_effort<'a>(effort: &'a str, model: &str) -> Option<&'a str> {
    let valid = match supported_efforts(model) {
        Some(v) => v,
        None => return None, // model doesn't support reasoning
    };
    // Direct match
    if valid.contains(&effort) {
        return Some(effort);
    }
    // Clamp: walk down then up in canonical ordering
    let order: &[&str] = &["none", "minimal", "low", "medium", "high", "xhigh"];
    let idx = order.iter().position(|&o| o == effort)?;
    // Walk down
    for i in (0..=idx).rev() {
        if valid.contains(&order[i]) {
            return Some(valid[valid.iter().position(|&v| v == order[i]).unwrap()]);
        }
    }
    // Walk up
    for i in (idx + 1)..order.len() {
        if valid.contains(&order[i]) {
            return Some(valid[valid.iter().position(|&v| v == order[i]).unwrap()]);
        }
    }
    Some(valid[valid.len() / 2])
}

fn normalize_verbosity(verbosity: &str) -> Option<&str> {
    match verbosity {
        "low" | "medium" | "high" => Some(verbosity),
        _ => None,
    }
}

#[derive(Default)]
pub struct StreamState {
    cancel: Arc<Mutex<bool>>,
}

pub async fn cancel_current_stream(state: &StreamState) {
    let mut cancel = state.cancel.lock().await;
    *cancel = true;
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StreamChunk {
    text: String,
    full_text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StreamDone {
    full_text: String,
    input_tokens: u64,
    output_tokens: u64,
}

#[derive(Serialize, Clone)]
struct StreamError {
    error: String,
}

// --- OpenAI Streaming ---
pub async fn stream_openai(
    app: tauri::AppHandle,
    messages: Vec<ChatMessage>,
    settings: &Settings,
) -> Result<(), String> {
    let api_key = if !settings.openai_api_key.is_empty() {
        settings.openai_api_key.clone()
    } else {
        std::env::var("OPENAI_API_KEY").unwrap_or_default()
    };

    if api_key.is_empty() {
        let _ = app.emit("stream-error", StreamError {
            error: "OpenAI API key not set. Go to Settings to configure.".to_string(),
        });
        return Ok(());
    }

    let default_system = "You are a helpful AI coding assistant. You help developers write, debug, and understand code. Be concise and precise in your responses. Use markdown formatting for code blocks.";

    let model = if settings.model.is_empty() {
        "gpt-4.1".to_string()
    } else {
        settings.model.clone()
    };

    let client = Client::new();
    if openai_use_responses_api(&model) {
        let mut input: Vec<serde_json::Value> = Vec::new();
        let has_system = messages.iter().any(|m| m.role == "system");
        if !has_system {
            input.push(serde_json::json!({
                "role": "system",
                "content": [{ "type": "input_text", "text": default_system }]
            }));
        }
        for msg in &messages {
            let content_type = if msg.role == "assistant" {
                "output_text"
            } else {
                "input_text"
            };
            input.push(serde_json::json!({
                "role": msg.role,
                "content": [{ "type": content_type, "text": msg.content }]
            }));
        }

        let mut body = serde_json::json!({
            "model": model,
            "stream": true,
            "input": input,
            "text": {
                "format": { "type": "text" }
            }
        });

        {
            if let Some(effort) = normalize_reasoning_effort(settings.effort.as_str(), &model) {
                body["reasoning"] = serde_json::json!({ "effort": effort });
            }
        }
        if openai_supports_verbosity(&model) {
            if let Some(v) = normalize_verbosity(settings.verbosity.as_str()) {
                body["text"]["verbosity"] = serde_json::Value::String(v.to_string());
            }
        }

        let response = client
            .post("https://api.openai.com/v1/responses")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            let _ = app.emit("stream-error", StreamError {
                error: format!("OpenAI API error ({}): {}", status, error_text),
            });
            return Ok(());
        }

        let state = app.state::<StreamState>();
        {
            let mut cancel = state.cancel.lock().await;
            *cancel = false;
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut full_text = String::new();

        while let Some(chunk) = stream.next().await {
            {
                let cancel = state.cancel.lock().await;
                if *cancel { break; }
            }

            let chunk = chunk.map_err(|e| e.to_string())?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            let lines: Vec<&str> = buffer.split('\n').collect();
            let last = lines.last().cloned().unwrap_or("");
            let complete_lines = &lines[..lines.len() - 1];

            for line in complete_lines {
                let line = line.trim();
                if let Some(data) = line.strip_prefix("data: ") {
                    let data = data.trim();
                    if data == "[DONE]" { continue; }
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                        if parsed.get("type").and_then(|v| v.as_str()) == Some("response.output_text.delta") {
                            if let Some(delta) = parsed.get("delta").and_then(|v| v.as_str()) {
                                full_text.push_str(delta);
                                let _ = app.emit("stream-response", StreamChunk {
                                    text: delta.to_string(),
                                    full_text: full_text.clone(),
                                });
                            }
                        } else if parsed.get("type").and_then(|v| v.as_str()) == Some("response.completed") {
                            if full_text.is_empty() {
                                if let Some(text) = extract_response_output_text(&parsed) {
                                    full_text = text.clone();
                                    let _ = app.emit("stream-response", StreamChunk {
                                        text,
                                        full_text: full_text.clone(),
                                    });
                                }
                            }
                        }
                    }
                }
            }

            buffer = last.to_string();
        }

        let _ = app.emit("stream-done", StreamDone {
            full_text,
            input_tokens: 0,
            output_tokens: 0,
        });
    } else {
        let mut chat_messages: Vec<serde_json::Value> = Vec::new();
        let has_system = messages.iter().any(|m| m.role == "system");
        if !has_system {
            chat_messages.push(serde_json::json!({
                "role": "system",
                "content": default_system
            }));
        }
        for msg in &messages {
            chat_messages.push(serde_json::json!({
                "role": msg.role,
                "content": msg.content
            }));
        }

        let mut body = serde_json::json!({
            "model": model,
            "stream": true,
            "messages": chat_messages
        });

        {
            if let Some(effort) = normalize_reasoning_effort(settings.effort.as_str(), &model) {
                body["reasoning_effort"] = serde_json::Value::String(effort.to_string());
            }
        }
        if openai_supports_verbosity(&model) {
            if let Some(v) = normalize_verbosity(settings.verbosity.as_str()) {
                body["verbosity"] = serde_json::Value::String(v.to_string());
            }
        }

        let response = client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            let _ = app.emit("stream-error", StreamError {
                error: format!("OpenAI API error ({}): {}", status, error_text),
            });
            return Ok(());
        }

        let state = app.state::<StreamState>();
        {
            let mut cancel = state.cancel.lock().await;
            *cancel = false;
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut full_text = String::new();

        while let Some(chunk) = stream.next().await {
            {
                let cancel = state.cancel.lock().await;
                if *cancel { break; }
            }

            let chunk = chunk.map_err(|e| e.to_string())?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            let lines: Vec<&str> = buffer.split('\n').collect();
            let last = lines.last().cloned().unwrap_or("");
            let complete_lines = &lines[..lines.len() - 1];

            for line in complete_lines {
                let line = line.trim();
                if let Some(data) = line.strip_prefix("data: ") {
                    let data = data.trim();
                    if data == "[DONE]" {
                        continue;
                    }
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                            full_text.push_str(delta);
                            let _ = app.emit("stream-response", StreamChunk {
                                text: delta.to_string(),
                                full_text: full_text.clone(),
                            });
                        }
                    }
                }
            }

            buffer = last.to_string();
        }

        let _ = app.emit("stream-done", StreamDone {
            full_text,
            input_tokens: 0,
            output_tokens: 0,
        });
    }

    Ok(())
}

// --- Anthropic Claude Streaming ---
pub async fn stream_anthropic(
    app: tauri::AppHandle,
    messages: Vec<ChatMessage>,
    settings: &Settings,
) -> Result<(), String> {
    let api_key = if !settings.anthropic_api_key.is_empty() {
        settings.anthropic_api_key.clone()
    } else {
        std::env::var("ANTHROPIC_API_KEY").unwrap_or_default()
    };

    if api_key.is_empty() {
        let _ = app.emit("stream-error", StreamError {
            error: "Anthropic API key not set. Go to Settings to configure.".to_string(),
        });
        return Ok(());
    }

    let system_msg = messages.iter().find(|m| m.role == "system");
    let chat_messages: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| serde_json::json!({"role": m.role, "content": m.content}))
        .collect();

    let system_text = system_msg
        .map(|m| m.content.clone())
        .unwrap_or_else(|| "You are a helpful AI coding assistant.".to_string());

    let model = if settings.model.is_empty() {
        "claude-sonnet-4-5-20250929".to_string()
    } else {
        settings.model.clone()
    };

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 8192,
        "stream": true,
        "system": system_text,
        "messages": chat_messages
    });

    let client = Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("Content-Type", "application/json")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        let _ = app.emit("stream-error", StreamError {
            error: format!("Anthropic API error ({}): {}", status, error_text),
        });
        return Ok(());
    }

    let state = app.state::<StreamState>();
    {
        let mut cancel = state.cancel.lock().await;
        *cancel = false;
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full_text = String::new();
    let mut input_tokens: u64 = 0;
    let mut output_tokens: u64 = 0;

    while let Some(chunk) = stream.next().await {
        {
            let cancel = state.cancel.lock().await;
            if *cancel {
                break;
            }
        }

        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        let lines: Vec<&str> = buffer.split('\n').collect();
        let last = lines.last().cloned().unwrap_or("");
        let complete_lines = &lines[..lines.len() - 1];

        for line in complete_lines {
            let line = line.trim();
            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();
                if data == "[DONE]" {
                    continue;
                }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if parsed["type"] == "content_block_delta" {
                        if let Some(text) = parsed["delta"]["text"].as_str() {
                            full_text.push_str(text);
                            let _ = app.emit("stream-response", StreamChunk {
                                text: text.to_string(),
                                full_text: full_text.clone(),
                            });
                        }
                    } else if parsed["type"] == "message_start" {
                        if let Some(tokens) = parsed["message"]["usage"]["input_tokens"].as_u64() {
                            input_tokens = tokens;
                        }
                    } else if parsed["type"] == "message_delta" {
                        if let Some(tokens) = parsed["usage"]["output_tokens"].as_u64() {
                            output_tokens = tokens;
                        }
                    }
                }
            }
        }

        buffer = last.to_string();
    }

    let _ = app.emit("stream-done", StreamDone {
        full_text,
        input_tokens,
        output_tokens,
    });

    Ok(())
}

// --- Azure OpenAI Streaming ---
pub async fn stream_azure_openai(
    app: tauri::AppHandle,
    messages: Vec<ChatMessage>,
    settings: &Settings,
) -> Result<(), String> {
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
        let _ = app.emit("stream-error", StreamError {
            error: "Azure OpenAI API key and endpoint not set. Go to Settings to configure.".to_string(),
        });
        return Ok(());
    }

    let mut chat_messages: Vec<serde_json::Value> = Vec::new();
    let has_system = messages.iter().any(|m| m.role == "system");
    if !has_system {
        chat_messages.push(serde_json::json!({
            "role": "system",
            "content": "You are a helpful AI coding assistant. You help developers write, debug, and understand code. Be concise and precise in your responses. Use markdown formatting for code blocks."
        }));
    }
    for msg in &messages {
        chat_messages.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content
        }));
    }

    let deployment = if settings.model.is_empty() {
        "gpt-4.1".to_string()
    } else {
        settings.model.clone()
    };

    let base = endpoint.trim_end_matches('/');
    let url = format!(
        "{}/openai/deployments/{}/chat/completions?api-version=2024-10-21",
        base, deployment
    );

    let body = serde_json::json!({
        "stream": true,
        "messages": chat_messages
    });

    let client = Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("api-key", &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        let _ = app.emit("stream-error", StreamError {
            error: format!("Azure OpenAI API error ({}): {}", status, error_text),
        });
        return Ok(());
    }

    let state = app.state::<StreamState>();
    {
        let mut cancel = state.cancel.lock().await;
        *cancel = false;
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full_text = String::new();

    while let Some(chunk) = stream.next().await {
        {
            let cancel = state.cancel.lock().await;
            if *cancel { break; }
        }

        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        let lines: Vec<&str> = buffer.split('\n').collect();
        let last = lines.last().cloned().unwrap_or("");
        let complete_lines = &lines[..lines.len() - 1];

        for line in complete_lines {
            let line = line.trim();
            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();
                if data == "[DONE]" { continue; }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                        full_text.push_str(delta);
                        let _ = app.emit("stream-response", StreamChunk {
                            text: delta.to_string(),
                            full_text: full_text.clone(),
                        });
                    }
                }
            }
        }

        buffer = last.to_string();
    }

    let _ = app.emit("stream-done", StreamDone {
        full_text,
        input_tokens: 0,
        output_tokens: 0,
    });

    Ok(())
}

// --- Gemini Streaming ---
pub async fn stream_gemini(
    app: tauri::AppHandle,
    messages: Vec<ChatMessage>,
    settings: &Settings,
) -> Result<(), String> {
    let api_key = if !settings.gemini_api_key.is_empty() {
        settings.gemini_api_key.clone()
    } else {
        std::env::var("GEMINI_API_KEY").unwrap_or_default()
    };

    if api_key.is_empty() {
        let _ = app.emit("stream-error", StreamError {
            error: "Gemini API key not set. Go to Settings to configure.".to_string(),
        });
        return Ok(());
    }

    let system_msg = messages.iter().find(|m| m.role == "system");
    let chat_messages: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            let role = if m.role == "assistant" { "model" } else { "user" };
            serde_json::json!({"role": role, "parts": [{"text": m.content}]})
        })
        .collect();

    let model = if settings.model.is_empty() {
        "gemini-2.0-flash".to_string()
    } else {
        settings.model.clone()
    };

    let mut body = serde_json::json!({
        "contents": chat_messages,
        "generationConfig": {"maxOutputTokens": 8192}
    });

    if let Some(sys) = system_msg {
        body["systemInstruction"] = serde_json::json!({"parts": [{"text": sys.content}]});
    }

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
        model, api_key
    );

    let client = Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        let _ = app.emit("stream-error", StreamError {
            error: format!("Gemini API error ({}): {}", status, error_text),
        });
        return Ok(());
    }

    let state = app.state::<StreamState>();
    {
        let mut cancel = state.cancel.lock().await;
        *cancel = false;
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full_text = String::new();

    while let Some(chunk) = stream.next().await {
        {
            let cancel = state.cancel.lock().await;
            if *cancel {
                break;
            }
        }

        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        let lines: Vec<&str> = buffer.split('\n').collect();
        let last = lines.last().cloned().unwrap_or("");
        let complete_lines = &lines[..lines.len() - 1];

        for line in complete_lines {
            let line = line.trim();
            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();
                if data.is_empty() {
                    continue;
                }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(text) = parsed["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                        full_text.push_str(text);
                        let _ = app.emit("stream-response", StreamChunk {
                            text: text.to_string(),
                            full_text: full_text.clone(),
                        });
                    }
                }
            }
        }

        buffer = last.to_string();
    }

    let _ = app.emit("stream-done", StreamDone {
        full_text,
        input_tokens: 0,
        output_tokens: 0,
    });

    Ok(())
}
