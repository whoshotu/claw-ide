import { useState, useRef } from "react";
import { useAppStore, FileEntry } from "../store/appStore";

interface FileTreeProps {
  tauriApi: any;
}

const getFileIcon = (entry: FileEntry) => {
  if (entry.isDir) return "📁";
  const ext = entry.extension?.toLowerCase();
  const iconMap: Record<string, string> = {
    ts: "📘", tsx: "📘", js: "📒", jsx: "📒",
    py: "🐍", rs: "🦀", go: "🔷", json: "📋",
    md: "📝", html: "🌐", css: "🎨",
  };
  return iconMap[ext || ""] || "📄";
};

export function FileTree({ tauriApi }: FileTreeProps) {
  const { files, toggleDirectory, openFile } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const hasApi = tauriApi && typeof tauriApi.invoke === 'function';

  const handleEntryClick = async (entry: FileEntry) => {
    if (entry.isDir) {
      toggleDirectory(entry.path);
    } else if (hasApi && !initialized.current) {
      try {
        initialized.current = true;
        const content = await tauriApi.invoke("read_file", { path: entry.path });
        openFile(entry.path, content);
        initialized.current = false;
      } catch (e) {
        setError(String(e));
        initialized.current = false;
      }
    }
  };

  if (!hasApi) {
    return (
      <div style={{ flex: 1, overflow: "auto", padding: "0.5rem" }}>
        <p style={{ fontSize: "0.875rem", color: "#666" }}>Waiting for Tauri...</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "0.5rem 0" }}>
      {error && <div style={{ padding: "0.5rem", color: "#f87171" }}>{error}</div>}
      {files.map((entry) => (
        <div
          key={entry.path}
          style={{ display: "flex", alignItems: "center", padding: "0.25rem 0.5rem", cursor: "pointer" }}
          onClick={() => handleEntryClick(entry)}
        >
          <span style={{ marginRight: "0.5rem" }}>{getFileIcon(entry)}</span>
          <span style={{ fontSize: "0.875rem", color: "#ccc" }}>{entry.name}</span>
        </div>
      ))}
    </div>
  );
}