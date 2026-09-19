import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";

interface SettingsPanelProps {
  tauriApi: any;
}

export function SettingsPanel({ tauriApi }: SettingsPanelProps) {
  const {
    model,
    setModel,
    apiProvider,
    setApiProvider,
    apiBaseUrl,
    setApiBaseUrl,
    apiKey,
    setApiKey,
    permissionMode,
  } = useAppStore();
  const [environment, setEnvironment] = useState<{ openrouterConfigured: boolean; openaiConfigured: boolean; openaiBaseUrl?: string; source: string } | null>(null);
  const [connection, setConnection] = useState<{ status: "idle" | "checking" | "connected" | "failed"; message: string }>({ status: "idle", message: "Not verified" });

  useEffect(() => {
    if (tauriApi?.invoke) {
      void tauriApi.invoke("provider_environment").then(setEnvironment).catch(() => setEnvironment(null));
    }
  }, [tauriApi]);

  const persistSettings = async (next: Record<string, string>) => {
    if (!tauriApi || !tauriApi.invoke) return;
    try {
      await tauriApi.invoke("write_settings", {
        settings: {
          apiProvider,
          apiBaseUrl,
          apiKey,
          model,
          permissionMode,
          ...next,
        },
      });
    } catch (e) {
      console.error("Failed to persist settings:", e);
    }
  };

  const providerOptions = [
    { value: "ollama", label: "Ollama (local)" },
    { value: "openai", label: "OpenAI" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "openai-compatible", label: "OpenAI-compatible" },
    { value: "anthropic-compatible", label: "Anthropic-compatible" },
    { value: "gemini", label: "Google Gemini-compatible" },
    { value: "xai", label: "xAI-compatible" },
    { value: "deepseek", label: "DeepSeek-compatible" },
  ];

  const verifyConnection = async () => {
    if (!tauriApi?.invoke) return;
    setConnection({ status: "checking", message: "Checking real provider connection…" });
    try {
      const result = await tauriApi.invoke("verify_provider_connection", { provider: apiProvider, baseUrl: apiBaseUrl, apiKey, model });
      setConnection({ status: "connected", message: `Connected · ${result.latencyMs} ms` });
    } catch (error) {
      setConnection({ status: "failed", message: String(error) });
    }
  };

  const importEnvironment = async () => {
    if (!tauriApi?.invoke) return;
    await tauriApi.invoke("import_provider_environment");
    const settings = await tauriApi.invoke("read_settings");
    if (settings.apiProvider) setApiProvider(settings.apiProvider);
    if (settings.apiBaseUrl) setApiBaseUrl(settings.apiBaseUrl);
    if (settings.apiKey !== undefined) setApiKey(settings.apiKey);
    if (settings.model) setModel(settings.model);
    setEnvironment(await tauriApi.invoke("provider_environment"));
  };

  return (
    <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h3 style={{ fontSize: "0.8rem", color: "#aaa", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>AI Provider</h3>
        <select
          value={apiProvider}
          onChange={async (e) => {
            const value = e.target.value as any;
            setApiProvider(value);
            await persistSettings({ apiProvider: value });
          }}
          style={{ background: "#3d3d3d", color: "#ccc", fontSize: "0.875rem", border: "1px solid #4d4d4d", padding: "0.5rem", width: "100%" }}
        >
          {providerOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div>
        <h3 style={{ fontSize: "0.8rem", color: "#aaa", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Base URL</h3>
        <input
          value={apiBaseUrl}
          onChange={async (e) => {
            const value = e.target.value;
            setApiBaseUrl(value);
            await persistSettings({ apiBaseUrl: value });
          }}
          placeholder={
            apiProvider === "ollama"
              ? "http://127.0.0.1:11434"
              : apiProvider === "openrouter"
                ? "https://openrouter.ai/api/v1"
                : "https://api.openai.com/v1"
          }
          style={{ background: "#3d3d3d", color: "#ccc", fontSize: "0.875rem", border: "1px solid #4d4d4d", padding: "0.5rem", width: "100%" }}
        />
      </div>

      <div>
        <h3 style={{ fontSize: "0.8rem", color: "#aaa", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>API Key</h3>
        <input
          type="password"
          value={apiKey}
          onChange={async (e) => {
            const value = e.target.value;
            setApiKey(value);
            await persistSettings({ apiKey: value });
          }}
          placeholder={apiProvider === "ollama" ? "Not required for local Ollama" : "API key"}
          style={{ background: "#3d3d3d", color: "#ccc", fontSize: "0.875rem", border: "1px solid #4d4d4d", padding: "0.5rem", width: "100%" }}
        />
      </div>

      <div>
        <h3 style={{ fontSize: "0.8rem", color: "#aaa", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Model</h3>
        <select
          value={model}
          onChange={async (e) => {
            const value = e.target.value;
            setModel(value);
            await persistSettings({ model: value });
          }}
          style={{ background: "#3d3d3d", color: "#ccc", fontSize: "0.875rem", border: "1px solid #4d4d4d", padding: "0.5rem", width: "100%" }}
        >
          <option value="qwen3:8b">Qwen3 8B (Local)</option>
          <option value="glm-5.1:cloud">GLM 5.1</option>
          <option value="kimi-k2.5:cloud">Kimi K2.5</option>
          <option value="gpt-4o-mini">GPT-4o mini</option>
          <option value="gpt-4.1-mini">GPT-4.1 mini</option>
          <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
          <option value="openrouter/free">OpenRouter Free</option>
          <option value="qwen/qwen3.8-27b:free">Qwen Free (OpenRouter)</option>
          <option value="deepseek/deepseek-chat-v3-0324:free">DeepSeek Free (OpenRouter)</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button onClick={() => void verifyConnection()} disabled={connection.status === "checking"}>Verify connection</button>
        <span className={`connection-status connection-${connection.status}`}>{connection.message}</span>
      </div>
      <div style={{ padding: "0.75rem", background: "rgba(34, 197, 94, 0.1)", borderRadius: "4px" }}>
        <span style={{ color: "#22c55e", fontSize: "0.875rem" }}>
          {apiProvider === "ollama"
            ? `✓ Ollama connected · ${apiBaseUrl}`
            : apiKey
              ? `✓ ${apiProvider === "openai" ? "OpenAI" : apiProvider === "openrouter" ? "OpenRouter" : "OpenAI-compatible"} configured`
              : `⚠ Add an API key for ${apiProvider === "openai" ? "OpenAI" : apiProvider === "openrouter" ? "OpenRouter" : "OpenAI-compatible"}`}
        </span>
      </div>
      <div className="provider-environment">
        <strong>Terminal environment</strong>
        <span>{environment?.source === "none" ? "No provider environment detected in this app process." : `${environment?.source} detected (value hidden)`}</span>
        <button onClick={() => void importEnvironment()} disabled={!environment || environment.source === "none"}>Use detected environment</button>
      </div>
    </div>
  );
}
