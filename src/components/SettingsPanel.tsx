import { useAppStore } from "../store/appStore";

interface SettingsPanelProps {
  tauriApi: any;
}

export function SettingsPanel({ tauriApi: _ }: SettingsPanelProps) {
  const { model, setModel } = useAppStore();

  return (
    <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h3 style={{ fontSize: "1rem", color: "#ccc", marginBottom: "0.5rem" }}>Model</h3>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{ background: "#3d3d3d", color: "#ccc", fontSize: "0.875rem", border: "1px solid #4d4d4d", padding: "0.5rem", width: "100%" }}
        >
          <option value="qwen3:8b">Qwen3 8B (Local)</option>
          <option value="glm-5.1:cloud">GLM 5.1</option>
          <option value="kimi-k2.5:cloud">Kimi K2.5</option>
        </select>
      </div>
      <div style={{ padding: "0.75rem", background: "rgba(34, 197, 94, 0.1)", borderRadius: "4px" }}>
        <span style={{ color: "#22c55e", fontSize: "0.875rem" }}>✓ Ollama connected · http://127.0.0.1:11434</span>
      </div>
    </div>
  );
}
