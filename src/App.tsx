import { useState, useEffect } from "react";
import { FileTree } from "./components/FileTree";
import { EditorPanel } from "./components/EditorPanel";
import { ChatPanel } from "./components/ChatPanel";
import { StatusBar } from "./components/StatusBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { ActivityBar } from "./components/ActivityBar";
import { CommandPalette, WorkbenchCommand } from "./components/CommandPalette";
import { RunPanel } from "./components/RunPanel";
import { SearchPanel } from "./components/SearchPanel";
import { SourceControlPanel } from "./components/SourceControlPanel";
import { useAppStore } from "./store/appStore";
import { ChevronDown, Command, PanelRight, Settings2, TerminalSquare } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

const MIN_PANEL_WIDTH = 150;
const MAX_PANEL_WIDTH = 500;

function App() {
  const {
    leftPanelWidth,
    rightPanelWidth,
    currentDirectory,
    leftView,
    setLeftView,
    setFiles,
    setCurrentDirectory,
    setInitialized,
    isInitialized,
    setApiProvider,
    setApiBaseUrl,
    setApiKey,
    setModel,
    setPermissionMode,
    setAgentTeam,
    apiKey,
    apiProvider,
  } = useAppStore();

  const [leftResizing, setLeftResizing] = useState(false);
  const [rightResizing, setRightResizing] = useState(false);
  const [tauriApi, setTauriApi] = useState<any>(null);
  const [inited, setInited] = useState(false);
  const [debugStatus, setDebugStatus] = useState("Loading...");
  const [showTerminal, setShowTerminal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const openFolderFromMenu = async () => {
    if (!tauriApi?.invoke) return;
    try {
      const directory = await open({ directory: true, multiple: false, title: "Open Folder" });
      if (directory) {
        const entries = await tauriApi.invoke("read_directory", { path: directory });
        setCurrentDirectory(directory);
        setFiles((entries || []).map((entry: any) => ({
          ...entry,
          isDir: Boolean(entry.isDir ?? entry.is_dir),
        })));
        setLeftView("explorer");
      }
    } catch (error) {
      console.error("Open folder failed:", error);
    } finally {
      setShowFileMenu(false);
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setShowCommandPalette(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        window.dispatchEvent(new Event("claw-save-all"));
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();
        window.dispatchEvent(new Event("claw-close-active"));
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const commands: WorkbenchCommand[] = [
    { id: "save", label: "File: Save", shortcut: "Ctrl+S", run: () => window.dispatchEvent(new Event("claw-save")) },
    { id: "save-all", label: "File: Save All", shortcut: "Ctrl+Alt+S", run: () => window.dispatchEvent(new Event("claw-save-all")) },
    { id: "close-active", label: "File: Close Active Editor", shortcut: "Ctrl+W", run: () => window.dispatchEvent(new Event("claw-close-active")) },
    { id: "explorer", label: "View: Explorer", run: () => setLeftView("explorer") },
    { id: "search", label: "View: Search", run: () => setLeftView("search") },
    { id: "source-control", label: "View: Source Control", run: () => setLeftView("source-control") },
    { id: "settings", label: "View: Settings", run: () => setShowSettings(true) },
    { id: "terminal", label: "View: Terminal", shortcut: "Ctrl+`", run: () => setShowTerminal((value) => !value) },
    { id: "palette", label: "View: Command Palette", shortcut: "Ctrl+Shift+P", run: () => setShowCommandPalette(true) },
  ];

  useEffect(() => {
    const handleSave = () => window.dispatchEvent(new Event("claw-save-active"));
    window.addEventListener("claw-save", handleSave);
    return () => window.removeEventListener("claw-save", handleSave);
  }, []);

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
      
      setDebugStatus("Loading settings...");
      const savedSettings = await invoke("read_settings").catch(() => ({}));
      if (savedSettings && typeof savedSettings === "object") {
        if (savedSettings.apiProvider) setApiProvider(savedSettings.apiProvider);
        if (savedSettings.apiBaseUrl) setApiBaseUrl(savedSettings.apiBaseUrl);
        if (savedSettings.apiKey !== undefined) setApiKey(savedSettings.apiKey || "");
        if (savedSettings.model) setModel(savedSettings.model);
        if (savedSettings.permissionMode) setPermissionMode(savedSettings.permissionMode);
      }

      setDebugStatus("Getting CWD...");
      const cwd = await invoke("get_current_directory");
      setCurrentDirectory(cwd);
      setDebugStatus("CWD: " + cwd);
      setFiles([]);
      const team = await invoke("initialize_agent_harness", {
        apiConfigured: apiProvider === "ollama" || Boolean(apiKey),
      }).catch(() => null);
      if (team) setAgentTeam(team);
      setDebugStatus("Ready");
      setInitialized(true);
    } catch (e) {
      console.error("Init error:", e);
      setDebugStatus("Error");
    }
  })();
}, [tauriApi, inited, setCurrentDirectory, setFiles, setInitialized, setApiProvider, setApiBaseUrl, setApiKey, setModel, setPermissionMode, setAgentTeam, apiKey, apiProvider]);

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
      <div className="title-bar">
        <div className="title-brand"><span className="title-brand-mark">C</span><strong>Claw IDE</strong></div>
        <div className="menu-wrapper">
          <button
            className="menu-button"
            aria-haspopup="menu"
            aria-expanded={showFileMenu}
            onClick={() => setShowFileMenu((value) => !value)}
          >
            File
          </button>
          {showFileMenu && (
            <div className="file-menu" role="menu">
              <button onClick={() => void openFolderFromMenu()}>Open Folder… <span>Ctrl+K Ctrl+O</span></button>
              <button onClick={() => { window.dispatchEvent(new Event("claw-save")); setShowFileMenu(false); }}>Save <span>Ctrl+S</span></button>
              <button onClick={() => { window.dispatchEvent(new Event("claw-save-all")); setShowFileMenu(false); }}>Save All <span>Ctrl+Alt+S</span></button>
              <button onClick={() => { window.dispatchEvent(new Event("claw-close-active")); setShowFileMenu(false); }}>Close Editor <span>Ctrl+W</span></button>
            </div>
          )}
        </div>
        <button className="menu-button">Edit <ChevronDown size={12} /></button>
        <button className="menu-button" onClick={() => setShowCommandPalette(true)}>View <ChevronDown size={12} /></button>
        <button className="menu-button" onClick={() => setShowSettings(true)}><Settings2 size={13} /> Settings</button>
        <div style={{ flex: 1 }} />
        <button className="quick-action" title="Command Palette" onClick={() => setShowCommandPalette(true)}><Command size={14} /></button>
        <button className="quick-action" title="Toggle terminal" onClick={() => setShowTerminal((value) => !value)}><TerminalSquare size={14} /></button>
        <button className="quick-action" title="Settings" onClick={() => setShowSettings(true)}><Settings2 size={14} /></button>
        <span className="title-status">{debugStatus}</span>
      </div>

      {/* Main Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <ActivityBar activeView={leftView} onViewChange={setLeftView} onTerminal={() => setShowTerminal((value) => !value)} />
        {/* Left Panel - File Tree */}
        <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#252526", borderRight: "1px solid #3d3d3d", width: leftPanelWidth }}>
          <div className="panel-title">
            <span>{leftView.replace("-", " ").toUpperCase()}</span>
            <ChevronDown size={13} />
          </div>
          {leftView === "explorer" ? (
            <FileTree tauriApi={tauriApi} />
          ) : leftView === "search" ? (
            <SearchPanel tauriApi={tauriApi} />
          ) : leftView === "run" ? (
            <RunPanel tauriApi={tauriApi} />
          ) : leftView === "source-control" ? (
            <SourceControlPanel tauriApi={tauriApi} />
          ) : (
            <div style={{ padding: "1rem", color: "#777", fontSize: "0.85rem" }}>
              {leftView === "extensions" && "Internal extensions are coming next."}
            </div>
          )}
        </div>

        {/* Left Resizer */}
        <div style={{ width: 4, cursor: "col-resize", background: "transparent" }} onMouseDown={() => setLeftResizing(true)} />

        {/* Center Panel - Editor */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column", backgroundColor: "#1e1e1e" }}>
          <EditorPanel tauriApi={tauriApi} />
        </div>

        {/* Right Resizer */}
        <div style={{ width: 4, cursor: "col-resize", background: "transparent" }} onMouseDown={() => setRightResizing(true)} />

        {/* Right Panel - persistent Chat */}
        <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#252526", borderLeft: "1px solid #3d3d3d", width: rightPanelWidth }}>
          <div className="panel-title">
            <span>CHAT / AGENTS</span>
            <div className="panel-title-actions"><button title="Toggle panel" onClick={() => setRightResizing((value) => !value)}><PanelRight size={13} /></button></div>
          </div>
          <ChatPanel isInitialized={isInitialized} tauriApi={tauriApi} />
        </div>
      </div>

      {showTerminal && <TerminalPanel tauriApi={tauriApi} cwd={currentDirectory} />}

      {/* Status Bar */}
      <StatusBar />
      {showCommandPalette && <CommandPalette commands={commands} onClose={() => setShowCommandPalette(false)} />}
      {showSettings && (
        <div className="settings-modal-backdrop" onMouseDown={() => setShowSettings(false)}>
          <div className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-modal-header">
              <strong>Settings</strong>
              <button onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <SettingsPanel tauriApi={tauriApi} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
