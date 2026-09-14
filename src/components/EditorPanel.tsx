import { useCallback, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { useAppStore } from "../store/appStore";

interface EditorPanelProps {
  tauriApi: any;
}

export function EditorPanel({ tauriApi }: EditorPanelProps) {
  const { openFiles, activeFilePath, closeFile, setActiveFile, updateFileContent, markFileClean } = useAppStore();

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const hasApi = tauriApi && typeof tauriApi.invoke === 'function';

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (activeFilePath && value !== undefined) {
        updateFileContent(activeFilePath, value);
      }
    },
    [activeFilePath, updateFileContent]
  );

  const handleSave = useCallback(async () => {
    if (!activeFile || !hasApi) return;
    try {
      await tauriApi.invoke("write_file", { path: activeFile.path, content: activeFile.content });
      markFileClean(activeFile.path);
    } catch (e) {
      console.error("Save error:", e);
    }
  }, [activeFile, markFileClean, hasApi, tauriApi]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  if (openFiles.length === 0) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1e1e1e" }}>
        <div style={{ textAlign: "center", color: "#666" }}>
          <p style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.5 }}>📄</p>
          <p style={{ fontSize: "0.875rem" }}>Open a file from the explorer</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Tab Bar */}
      <div style={{ display: "flex", backgroundColor: "#2d2d2d", overflowX: "auto" }}>
        {openFiles.map((file) => (
          <div
            key={file.path}
            style={{
              display: "flex",
              alignItems: "center",
              height: "2rem",
              padding: "0 0.75rem",
              borderRight: "1px solid #3d3d3d",
              cursor: "pointer",
              backgroundColor: file.path === activeFilePath ? "#1e1e1e" : "transparent",
              borderTop: file.path === activeFilePath ? "2px solid #3b82f6" : "2px solid transparent",
            }}
            onClick={() => setActiveFile(file.path)}
          >
            {file.dirty && <span style={{ width: 8, height: 8, background: "#eab308", borderRadius: "50%", marginRight: "0.5rem" }} />}
            <span style={{ fontSize: "0.875rem", color: "#ccc" }}>{file.name}</span>
            <button
              style={{ marginLeft: "0.5rem", padding: "0.125rem", background: "transparent", border: "none", cursor: "pointer", color: "#888" }}
              onClick={(e) => { e.stopPropagation(); closeFile(file.path); }}
            >✕</button>
          </div>
        ))}
      </div>

      {activeFile && (
        <Editor
          height="100%"
          language={activeFile.language}
          value={activeFile.content}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            fontSize: 14,
            minimap: { enabled: true },
            lineNumbers: "on",
            folding: true,
            wordWrap: "on",
            automaticLayout: true,
            scrollBeyondLastLine: false,
          }}
        />
      )}
    </div>
  );
}