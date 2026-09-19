import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";

interface SourceControlPanelProps {
  tauriApi: any;
}

interface GitStatus {
  branch: string;
  changes: string[];
  diff: string;
}

export function SourceControlPanel({ tauriApi }: SourceControlPanelProps) {
  const { currentDirectory } = useAppStore();
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!currentDirectory || !tauriApi?.invoke) return;
    setLoading(true);
    setError(null);
    try {
      setStatus(await tauriApi.invoke("git_status", { cwd: currentDirectory }));
    } catch (cause) {
      setStatus(null);
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [currentDirectory, tauriApi]);

  if (!currentDirectory) return <div className="source-control-panel">Open a folder to use source control.</div>;

  return (
    <div className="source-control-panel">
      <div className="source-control-toolbar">
        <span>{status?.branch || "SOURCE CONTROL"}</span>
        <button onClick={() => void refresh()} disabled={loading}>{loading ? "…" : "Refresh"}</button>
      </div>
      {error && <div className="search-error">{error}</div>}
      {!error && status && status.changes.length === 0 && <div className="search-empty">Working tree clean.</div>}
      {status?.changes.map((change) => (
        <div className="source-control-change" key={change}>
          <code>{change.slice(0, 2)}</code>
          <span>{change.slice(3)}</span>
        </div>
      ))}
      {status?.diff && (
        <details className="source-control-diff">
          <summary>Current diff</summary>
          <pre>{status.diff}</pre>
        </details>
      )}
    </div>
  );
}
