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
  const { files, currentDirectory, toggleDirectory, openFile, setFiles, setCurrentDirectory } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const hasApi = tauriApi && typeof tauriApi.invoke === 'function';

  const loadDirectory = async (directory: string) => {
    if (!hasApi) return;
    try {
      const entries = await tauriApi.invoke("read_directory", { path: directory });
      const normalized = (entries || []).map((entry: any) => ({
        ...entry,
        isDir: Boolean(entry.isDir ?? entry.is_dir),
        extension: entry.extension ?? (entry.name ? entry.name.split(".").pop() : undefined),
      }));
      setCurrentDirectory(directory);
      setFiles(normalized);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAddFolder = async () => {
    if (!hasApi) return;
    try {
      const directory = await tauriApi.invoke("pick_directory");
      if (directory) {
        await loadDirectory(directory);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleNewFolder = async () => {
    if (!hasApi) return;
    try {
      const base = currentDirectory || (await tauriApi.invoke("get_current_directory"));
      const folderName = `new-folder-${Date.now()}`;
      const folderPath = `${base}/${folderName}`;
      await tauriApi.invoke("create_directory", { path: folderPath });
      await loadDirectory(base);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleEntryClick = async (entry: FileEntry) => {
    if (entry.isDir) {
      toggleDirectory(entry.path);
      return;
    }

    if (!hasApi) {
      setError("Tauri backend not available");
      return;
    }

    if (initialized.current) return;

    try {
      initialized.current = true;
      const content = await tauriApi.invoke("read_file", { path: entry.path });
      openFile(entry.path, content);
    } catch (e) {
      setError(String(e));
    } finally {
      initialized.current = false;
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
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem 0.75rem", borderBottom: "1px solid #3d3d3d" }}>
        <button
          onClick={handleAddFolder}
          style={{ flex: 1, background: "#3b82f6", color: "white", border: "none", borderRadius: "4px", padding: "0.4rem 0.5rem", cursor: "pointer" }}
        >
          + Folder
        </button>
        <button
          onClick={handleNewFolder}
          style={{ flex: 1, background: "#2d2d2d", color: "#ddd", border: "1px solid #4d4d4d", borderRadius: "4px", padding: "0.4rem 0.5rem", cursor: "pointer" }}
        >
          New Folder
        </button>
      </div>

      {error && <div style={{ padding: "0.5rem 0.75rem", color: "#f87171" }}>{error}</div>}

      {files.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 220, padding: "1rem", color: "#777" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📁</div>
          <div style={{ fontSize: "0.85rem", textAlign: "center" }}>No folder opened yet</div>
          <div style={{ fontSize: "0.75rem", marginTop: "0.5rem", textAlign: "center" }}>Use + Folder to open a local project</div>
        </div>
      ) : (
        files.map((entry) => (
          <div
            key={entry.path}
            style={{ display: "flex", alignItems: "center", padding: "0.25rem 0.5rem", cursor: "pointer" }}
            onClick={() => handleEntryClick(entry)}
          >
            <span style={{ marginRight: "0.5rem" }}>{getFileIcon(entry)}</span>
            <span style={{ fontSize: "0.875rem", color: "#ccc" }}>{entry.name}</span>
          </div>
        ))
      )}
    </div>
  );
}