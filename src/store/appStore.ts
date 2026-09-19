import { create } from "zustand";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  extension?: string;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  language: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolInvocations?: string[];
}

export interface ClawVersion {
  version: string;
  isCompatible: boolean;
  isRecommended: boolean;
}

export type ApiProvider = "ollama" | "openai" | "openrouter" | "anthropic-compatible" | "gemini" | "xai" | "deepseek" | "openai-compatible";
export type WorkbenchView = "explorer" | "search" | "source-control" | "run" | "extensions";
export type AgentBackend = "provider" | "claw-code" | "clawbot";
export type AgentRuntimeStatus = "starting" | "ready" | "unavailable" | "degraded";

export interface AgentTeamStatus {
  clawCode: AgentRuntimeStatus;
  clawBot: AgentRuntimeStatus;
  apiBackup: AgentRuntimeStatus;
  activeBackend: AgentBackend;
  message: string;
}

interface AppState {
  // File tree state
  currentDirectory: string;
  files: FileEntry[];
  expandedDirs: Set<string>;

  // Editor state
  openFiles: OpenFile[];
  activeFilePath: string | null;

  // Chat state
  messages: ChatMessage[];
  isStreaming: boolean;
  permissionMode: string;
  model: string;
  apiProvider: ApiProvider;
  apiBaseUrl: string;
  apiKey: string;

  // Claw state
  clawPath: string | null;
  clawVersion: ClawVersion | null;
  isInitialized: boolean;
  apiKeyConfigured: boolean;

  // UI state
  leftPanelWidth: number;
  rightPanelWidth: number;
  leftView: WorkbenchView;
  agentBackend: AgentBackend;
  agentTeam: AgentTeamStatus;

  // Actions
  setCurrentDirectory: (directory: string) => void;
  setFiles: (files: FileEntry[]) => void;
  toggleDirectory: (path: string) => void;
  openFile: (path: string, content: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileClean: (path: string) => void;
  updateMessage: (id: string, content: string) => void;
  addMessage: (message: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;
  setClawPath: (path: string) => void;
  setClawVersion: (version: ClawVersion) => void;
  setInitialized: (initialized: boolean) => void;
  setApiKeyConfigured: (configured: boolean) => void;
  setPermissionMode: (mode: string) => void;
  setModel: (model: string) => void;
  setApiProvider: (provider: ApiProvider) => void;
  setApiBaseUrl: (baseUrl: string) => void;
  setApiKey: (apiKey: string) => void;
  setPanelWidth: (panel: "left" | "right", width: number) => void;
  setLeftView: (view: WorkbenchView) => void;
  setAgentBackend: (backend: AgentBackend) => void;
  setAgentTeam: (team: AgentTeamStatus) => void;
}

const getLanguageFromExtension = (extension: string): string => {
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    json: "json",
    md: "markdown",
    html: "html",
    css: "css",
    toml: "toml",
    yml: "yaml",
    yaml: "yaml",
  };
  return languageMap[extension] || "plaintext";
};

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  currentDirectory: "",
  files: [],
  expandedDirs: new Set(),

  openFiles: [],
  activeFilePath: null,

  messages: [],
  isStreaming: false,
  permissionMode: "workspace-write",
  model: "qwen3:8b",
  apiProvider: "ollama",
  apiBaseUrl: "http://127.0.0.1:11434",
  apiKey: "",

  clawPath: null,
  clawVersion: null,
  isInitialized: false,
  apiKeyConfigured: false,

  leftPanelWidth: 250,
  rightPanelWidth: 350,
  leftView: "explorer",
  agentBackend: "provider",
  agentTeam: {
    clawCode: "starting",
    clawBot: "starting",
    apiBackup: "starting",
    activeBackend: "provider",
    message: "Starting agent team…",
  },

  // Actions
  setCurrentDirectory: (directory) => set({ currentDirectory: directory }),
  setFiles: (files) => set({ files }),

  toggleDirectory: (path) =>
    set((state) => {
      const newExpanded = new Set(state.expandedDirs);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { expandedDirs: newExpanded };
    }),

  openFile: (path, content) =>
    set((state) => {
      const existing = state.openFiles.find((f) => f.path === path);
      if (existing) {
        return { activeFilePath: path };
      }
      const name = path.split(/[/\\]/).pop() || path;
      const extension = name.split(".").pop() || "";
      const newFile: OpenFile = {
        path,
        name,
        content,
        dirty: false,
        language: getLanguageFromExtension(extension),
      };
      return {
        openFiles: [...state.openFiles, newFile],
        activeFilePath: path,
      };
    }),

  closeFile: (path) =>
    set((state) => {
      const newFiles = state.openFiles.filter((f) => f.path !== path);
      let newActive = state.activeFilePath;
      if (state.activeFilePath === path) {
        newActive = newFiles.length > 0 ? newFiles[newFiles.length - 1].path : null;
      }
      return { openFiles: newFiles, activeFilePath: newActive };
    }),

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateFileContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content, dirty: true } : f
      ),
    })),

  markFileClean: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, dirty: false } : f
      ),
    })),

  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content } : m
      ),
    })),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setClawPath: (path) => set({ clawPath: path }),

  setClawVersion: (version) => set({ clawVersion: version }),

  setInitialized: (initialized) => set({ isInitialized: initialized }),

  setApiKeyConfigured: (configured) => set({ apiKeyConfigured: configured }),

  setPermissionMode: (mode) => set({ permissionMode: mode }),

  setModel: (model) => set({ model }),

  setApiProvider: (provider) => set({ apiProvider: provider }),

  setApiBaseUrl: (baseUrl) => set({ apiBaseUrl: baseUrl }),

  setApiKey: (apiKey) => set({ apiKey }),

  setPanelWidth: (panel, width) =>
    set(() => ({
      [panel === "left" ? "leftPanelWidth" : "rightPanelWidth"]: width,
    })),

  setLeftView: (view) => set({ leftView: view }),
  setAgentBackend: (backend) => set({ agentBackend: backend }),
  setAgentTeam: (agentTeam) => set({ agentTeam }),
}));