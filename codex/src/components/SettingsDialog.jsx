import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const PROVIDERS = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "gemini", name: "Gemini" },
  { id: "azure", name: "Azure OpenAI" },
];

export default function SettingsDialog({ settings, models, onSave, onClose, getEffortOptions, clampEffort }) {
  const [form, setForm] = useState({
    ...settings,
    effort: clampEffort(settings.effort || "high", settings.model),
    verbosity: settings.verbosity || "medium",
  });
  const [localModels, setLocalModels] = useState(models);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState("");

  function getApiKeyForProvider(provider) {
    switch (provider) {
      case "openai": return form.openaiApiKey || "";
      case "anthropic": return form.anthropicApiKey || "";
      case "gemini": return form.geminiApiKey || "";
      case "azure": return form.azureOpenaiApiKey || "";
      default: return "";
    }
  }

  function canFetchModels() {
    if (form.provider === "anthropic") return true; // hardcoded, always available
    if (form.provider === "azure") return !!(form.azureOpenaiApiKey && form.azureOpenaiEndpoint);
    return !!getApiKeyForProvider(form.provider);
  }

  async function handleFetchModels() {
    setFetchingModels(true);
    setFetchError("");
    try {
      const result = await invoke("fetch_provider_models", {
        provider: form.provider,
        apiKey: getApiKeyForProvider(form.provider),
        endpoint: form.azureOpenaiEndpoint || "",
      });
      if (result && result.length > 0) {
        setLocalModels(result);
        // Auto-select first model if current model doesn't exist in new list
        const exists = result.some((m) => m.id === form.model);
        if (!exists) {
          const newModel = result[0].id;
          setForm((f) => ({ ...f, model: newModel, effort: clampEffort(f.effort, newModel) }));
        }
      }
    } catch (e) {
      setFetchError(String(e));
    }
    setFetchingModels(false);
  }

  function handleProviderChange(provider) {
    setForm((f) => ({ ...f, provider }));
    setLocalModels([]);
    setFetchError("");
    // Set a sensible default model for the provider
    const defaults = {
      openai: "gpt-4.1",
      anthropic: "claude-sonnet-4-5-20250929",
      gemini: "gemini-2.0-flash",
      azure: "",
    };
    const newModel = defaults[provider] || "";
    setForm((f) => ({ ...f, provider, model: newModel, effort: clampEffort(f.effort, newModel) }));
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
            <label>Provider</label>
            <select
              value={form.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Provider-specific API key fields */}
          {form.provider === "openai" && (
            <div className="setting-group">
              <label>OpenAI API Key</label>
              <input
                type="password"
                value={form.openaiApiKey}
                onChange={(e) => setForm((f) => ({ ...f, openaiApiKey: e.target.value }))}
                placeholder="sk-..."
                autoComplete="off"
              />
            </div>
          )}

          {form.provider === "anthropic" && (
            <div className="setting-group">
              <label>Anthropic API Key</label>
              <input
                type="password"
                value={form.anthropicApiKey}
                onChange={(e) => setForm((f) => ({ ...f, anthropicApiKey: e.target.value }))}
                placeholder="sk-ant-..."
                autoComplete="off"
              />
            </div>
          )}

          {form.provider === "gemini" && (
            <div className="setting-group">
              <label>Gemini API Key</label>
              <input
                type="password"
                value={form.geminiApiKey}
                onChange={(e) => setForm((f) => ({ ...f, geminiApiKey: e.target.value }))}
                placeholder="AIza..."
                autoComplete="off"
              />
            </div>
          )}

          {form.provider === "azure" && (
            <>
              <div className="setting-group">
                <label>Azure OpenAI API Key</label>
                <input
                  type="password"
                  value={form.azureOpenaiApiKey}
                  onChange={(e) => setForm((f) => ({ ...f, azureOpenaiApiKey: e.target.value }))}
                  placeholder="Azure API key..."
                  autoComplete="off"
                />
              </div>
              <div className="setting-group">
                <label>Azure Endpoint</label>
                <input
                  type="text"
                  value={form.azureOpenaiEndpoint}
                  onChange={(e) => setForm((f) => ({ ...f, azureOpenaiEndpoint: e.target.value }))}
                  placeholder="https://your-resource.openai.azure.com"
                  autoComplete="off"
                />
              </div>
            </>
          )}

          <div className="setting-group">
            <label>
              Model
              {displayModels.length > 0 && ` (${displayModels.length} available)`}
            </label>
            <div className="dir-input-row">
              <select
                value={form.model}
                onChange={(e) => {
                  const newModel = e.target.value;
                  setForm((f) => ({
                    ...f,
                    model: newModel,
                    effort: clampEffort(f.effort, newModel),
                  }));
                }}
              >
                {displayModels.length > 0 ? (
                  displayModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))
                ) : (
                  <option value={form.model}>
                    {form.model || "Fetch models to see options"}
                  </option>
                )}
              </select>
              <button
                className="btn-secondary"
                onClick={handleFetchModels}
                disabled={fetchingModels || !canFetchModels()}
              >
                {fetchingModels ? "Fetching..." : "Fetch Models"}
              </button>
            </div>
            {fetchError && (
              <div className="setting-error">{fetchError}</div>
            )}
          </div>

          {getEffortOptions(form.model).length > 0 && (
            <div className="setting-group">
              <label>Reasoning Effort</label>
              <select
                value={form.effort}
                onChange={(e) => setForm((f) => ({ ...f, effort: e.target.value }))}
              >
                {getEffortOptions(form.model).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}

          {form.provider === "openai" && (
            <div className="setting-group">
              <label>Verbosity (GPT-5 only)</label>
              <select
                value={form.verbosity}
                onChange={(e) => setForm((f) => ({ ...f, verbosity: e.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          )}

          <button className="btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
