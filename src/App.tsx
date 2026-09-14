import { useState, useEffect } from "react";
import { FileTree } from "./components/FileTree";
import { EditorPanel } from "./components/EditorPanel";
import { ChatPanel } from "./components/ChatPanel";
import { StatusBar } from "./components/StatusBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { useAppStore } from "./store/appStore";

const MIN_PANEL_WIDTH = 150;
const MAX_PANEL_WIDTH = 500;

function App() {
  const {
    leftPanelWidth,
    rightPanelWidth,
    setFiles,

    setInitialized,
    isInitialized,
  } = useAppStore();

  const [leftResizing, setLeftResizing] = useState(false);
  const [rightResizing, setRightResizing] = useState(false);
  const [tauriApi, setTauriApi] = useState<any>(null);
  const [inited, setInited] = useState(false);
  const [debugStatus, setDebugStatus] = useState("Loading...");
  const [showSettings, setShowSettings] = useState(false);

  // Load Tauri API once
  useEffect(() => {
    if (tauriApi || inited) return;
    
    import("@tauri-apps/api/core").then((api) => {
      console.log("Got Tauri API");
      
      // Just try to use invoke directly - don't pre-check
      const wrappedApi = {
        ...api,
        invoke: async (cmd: string, args?: any, opts?: any) => {
          try {
            return await api.invoke(cmd, args, opts);
          } catch (e: any) {
            console.error("Invoke error for", cmd, ":", e?.message || e);
            throw e;
          }
        }
      };
      
      setTauriApi(wrappedApi);
    }).catch((e) => {
      console.error("Failed to load:", e);
    });
  }, []);

  // Initialize on API load
 useEffect(() => {
  if (!tauriApi || inited || !tauriApi.invoke) return;
  
  setInited(true);
  
  (async () => {
    try {
      const invoke = tauriApi.invoke;
      
      setDebugStatus("Getting CWD...");
      const cwd = await invoke("get_current_directory");
      setDebugStatus("CWD: " + cwd);
      
      setDebugStatus("Reading files...");
      const entries = await invoke("read_directory", { path: cwd });
      setDebugStatus("Found " + entries.length + " files");
      setFiles(entries);

      setDebugStatus("Ready");
      setInitialized(true);
    } catch (e) {
      console.error("Init error:", e);
      setDebugStatus("Error");
    }
  })();
}, [tauriApi, inited]);

  const handleMouseMove = (e: MouseEvent) => {
    if (leftResizing) {
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, e.clientX));
      useAppStore.getState().setPanelWidth("left", newWidth);
    }
    if (rightResizing) {
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, window.innerWidth - e.clientX));
      useAppStore.getState().setPanelWidth("right", newWidth);
    }
  };

  const handleMouseUp = () => {
    setLeftResizing(false);
    setRightResizing(false);
  };

  useEffect(() => {
    if (leftResizing || rightResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [leftResizing, rightResizing]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#1e1e1e" }}>
      {/* Menu Bar */}
      <div style={{ display: "flex", alignItems: "center", height: "2rem", backgroundColor: "#2d2d2d", borderBottom: "1px solid #3d3d3d", padding: "0 0.5rem" }}>
        <button style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem", color: "#ccc", background: "transparent", border: "none", cursor: "pointer" }}>File</button>
        <button style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem", color: "#ccc", background: "transparent", border: "none", cursor: "pointer" }}>Edit</button>
        <button style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem", color: "#ccc", background: "transparent", border: "none", cursor: "pointer" }}>View</button>
        <button onClick={() => setShowSettings(!showSettings)} style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem", color: "#ccc", background: "transparent", border: "none", cursor: "pointer" }}>Settings</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: "0.75rem", color: "#666" }}>Claw IDE</span>
        <span style={{ fontSize: "0.7rem", color: "#f59e0b", marginLeft: "0.5rem" }}>[{debugStatus}]</span>
      </div>

      {/* Main Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Panel - File Tree */}
        <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#252526", borderRight: "1px solid #3d3d3d", width: leftPanelWidth }}>
          <div style={{ display: "flex", alignItems: "center", height: "2rem", padding: "0 0.5rem", borderBottom: "1px solid #3d3d3d" }}>
            <span style={{ fontSize: "0.75rem", color: "#888" }}>EXPLORER</span>
          </div>
          <FileTree tauriApi={tauriApi} />
        </div>

        {/* Left Resizer */}
        <div style={{ width: 4, cursor: "col-resize", background: "transparent" }} onMouseDown={() => setLeftResizing(true)} />

        {/* Center Panel - Editor */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column", backgroundColor: "#1e1e1e" }}>
          <EditorPanel tauriApi={tauriApi} />
        </div>

        {/* Right Resizer */}
        <div style={{ width: 4, cursor: "col-resize", background: "transparent" }} onMouseDown={() => setRightResizing(true)} />

        {/* Right Panel - Chat or Settings */}
        <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#252526", borderLeft: "1px solid #3d3d3d", width: rightPanelWidth }}>
          <div style={{ display: "flex", alignItems: "center", height: "2rem", padding: "0 0.5rem", borderBottom: "1px solid #3d3d3d" }}>
            <span style={{ fontSize: "0.75rem", color: "#888" }}>{showSettings ? "SETTINGS" : "AI CHAT"}</span>
          </div>
          {showSettings ? (
            <SettingsPanel tauriApi={tauriApi} />
          ) : (
            <ChatPanel isInitialized={isInitialized} tauriApi={tauriApi} />
          )}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
}

export default App;
