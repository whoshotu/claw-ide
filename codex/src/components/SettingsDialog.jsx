import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function SettingsDialog({ settings, models, onSave, onClose }) {
  const [form, setForm] = useState({ ...settings });
  const [localModels, setLocalModels] = useState(models);
  const [fetchingModels, setFetchingModels] = useState(false);

  async function handleFetchModels() {
    if (!form.openaiApiKey) return;
    setFetchingModels(true);
    try {
      const result = await invoke("fetch_models", { apiKey: form.openaiApiKey });
      if (result && result.length > 0) {
        setLocalModels(result);
      }
    } catch (e) {
      console.error("Failed to fetch models:", e);
    }
    setFetchingModels(false);
  }

  function handleSave() {
    onSave(form);
  }

  const displayModels = localModels.length > 0 ? localModels : models;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Settings</h2>
          <button className="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="dialog-body">
          <div className="setting-group">
            <label>OpenAI API Key</label>
            <div className="dir-input-row">
              <input
                type="password"
                value={form.openaiApiKey}
                onChange={(e) =>
                  setForm((f) => ({ ...f, openaiApiKey: e.target.value }))
                }
                placeholder="sk-..."
                autoComplete="off"
              />
              <button
                className="btn-secondary"
                onClick={handleFetchModels}
                disabled={fetchingModels || !form.openaiApiKey}
              >
                {fetchingModels ? "Fetching..." : "Fetch Models"}
              </button>
            </div>
          </div>
          <div className="setting-group">
            <label>Provider</label>
            <select
              value={form.provider}
              onChange={(e) =>
                setForm((f) => ({ ...f, provider: e.target.value }))
              }
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>
          <div className="setting-group">
            <label>Model {displayModels.length > 0 && `(${displayModels.length} available)`}</label>
            <select
              value={form.model}
              onChange={(e) =>
                setForm((f) => ({ ...f, model: e.target.value }))
              }
            >
              {displayModels.length > 0 ? (
                displayModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))
              ) : (
                <option value={form.model}>{form.model} (enter API key to load models)</option>
              )}
            </select>
          </div>
          <div className="setting-group">
            <label>Effort</label>
            <select
              value={form.effort}
              onChange={(e) =>
                setForm((f) => ({ ...f, effort: e.target.value }))
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <button className="btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
