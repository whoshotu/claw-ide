import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import WelcomeScreen from "./components/WelcomeScreen";
import MessagesArea from "./components/MessagesArea";
import InputArea from "./components/InputArea";
import StatusBar from "./components/StatusBar";
import SettingsDialog from "./components/SettingsDialog";

const EFFORTS = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function App() {
  const [settings, setSettings] = useState({
    provider: "openai",
    model: "gpt-4o",
    openaiApiKey: "",
    anthropicApiKey: "",
    geminiApiKey: "",
    effort: "high",
  });
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Project state
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProject, setActiveProject] = useState(null);

  // Thread state (scoped to active project)
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);

  // Streaming / opencode state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [progressLines, setProgressLines] = useState([]);
  const [opencodeAvailable, setOpencodeAvailable] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const streamingTextRef = useRef("");

  // Load settings and projects on mount
  useEffect(() => {
    loadSettings();
    loadProjects();
    checkOpenCode();
  }, []);

  // Fetch models when API key changes
  useEffect(() => {
    if (settings.openaiApiKey) {
      fetchModels(settings.openaiApiKey);
    }
  }, [settings.openaiApiKey]);

  // Load threads when active project changes
  useEffect(() => {
    if (activeProjectId) {
      loadThreads(activeProjectId);
      const proj = projects.find((p) => p.id === activeProjectId);
      setActiveProject(proj || null);
    } else {
      setThreads([]);
      setActiveProject(null);
    }
    setActiveThreadId(null);
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
  }, [activeProjectId]);

  async function checkOpenCode() {
    try {
      await invoke("check_opencode");
      setOpencodeAvailable(true);
    } catch {
      setOpencodeAvailable(false);
    }
  }

  async function fetchModels(apiKey) {
    setModelsLoading(true);
    try {
      const result = await invoke("fetch_models", { apiKey: apiKey || "" });
      if (result && result.length > 0) {
        setModels(result);
      }
    } catch (e) {
      console.error("Failed to fetch models:", e);
    }
    setModelsLoading(false);
  }

  // Listen for opencode events
  useEffect(() => {
    const unlistenProgress = listen("opencode-progress", (event) => {
      const { line } = event.payload;
      setProgressLines((prev) => [...prev.slice(-50), line]);
      setStreamingText((prev) => prev + line + "\n");
      streamingTextRef.current += line + "\n";
    });

    const unlistenDone = listen("opencode-done", (event) => {
      const { output } = event.payload;
      setIsStreaming(false);
      setStreamingText("");
      setProgressLines([]);
      streamingTextRef.current = "";

      // Parse the JSON output from opencode
      let content = output;
      try {
        const parsed = JSON.parse(output);
        // opencode JSON output typically has a message/content field
        if (parsed.message) content = parsed.message;
        else if (parsed.content) content = parsed.content;
        else if (parsed.response) content = parsed.response;
        else content = JSON.stringify(parsed, null, 2);
      } catch {
        // Not JSON, use raw output
      }

      const assistantMsg = {
        role: "assistant",
        content,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    });

    const unlistenError = listen("opencode-error", (event) => {
      setIsStreaming(false);
      setStreamingText("");
      setProgressLines([]);
      streamingTextRef.current = "";

      const errorMsg = {
        role: "assistant",
        content: `Error: ${event.payload.error}`,
        timestamp: Date.now(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    });

    // Also keep LLM streaming events as fallback
    const unlistenResponse = listen("stream-response", (event) => {
      const { fullText } = event.payload;
      streamingTextRef.current = fullText;
      setStreamingText(fullText);
    });

    const unlistenStreamDone = listen("stream-done", (event) => {
      const { fullText } = event.payload;
      setIsStreaming(false);
      setStreamingText("");
      streamingTextRef.current = "";

      const assistantMsg = {
        role: "assistant",
        content: fullText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    });

    const unlistenStreamError = listen("stream-error", (event) => {
      setIsStreaming(false);
      setStreamingText("");
      streamingTextRef.current = "";

      const errorMsg = {
        role: "assistant",
        content: `Error: ${event.payload.error}`,
        timestamp: Date.now(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenDone.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenResponse.then((fn) => fn());
      unlistenStreamDone.then((fn) => fn());
      unlistenStreamError.then((fn) => fn());
    };
  }, []);

  // Auto-save thread when messages change
  useEffect(() => {
    if (activeProjectId && activeThreadId && messages.length > 0) {
      saveCurrentThread();
    }
  }, [messages, activeThreadId]);

  async function loadSettings() {
    try {
      const s = await invoke("get_settings");
      setSettings(s);
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async function loadProjects() {
    try {
      const projs = await invoke("get_projects");
      setProjects(projs);
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }

  async function loadThreads(projectId) {
    try {
      const t = await invoke("get_project_threads", { projectId });
      setThreads(t);
    } catch (e) {
      console.error("Failed to load threads:", e);
    }
  }

  async function createProject(directory) {
    const name = directory.split("/").pop() || directory.split("\\").pop() || directory;
    const project = {
      id: generateId(),
      name,
      directory,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await invoke("save_project", { project });
      await loadProjects();
      setActiveProjectId(project.id);
    } catch (e) {
      console.error("Failed to create project:", e);
    }
  }

  async function deleteProject(projectId) {
    try {
      await invoke("delete_project", { projectId });
      if (activeProjectId === projectId) {
        setActiveProjectId(null);
      }
      await loadProjects();
    } catch (e) {
      console.error("Failed to delete project:", e);
    }
  }

  async function saveCurrentThread() {
    if (!activeProjectId || !activeThreadId) return;
    const title =
      messages.find((m) => m.role === "user")?.content?.slice(0, 60) || "New thread";
    const session = {
      id: activeThreadId,
      title,
      messages,
      createdAt:
        threads.find((t) => t.id === activeThreadId)?.createdAt || Date.now(),
      updatedAt: Date.now(),
      projectId: activeProjectId,
    };
    try {
      await invoke("save_project_thread", {
        projectId: activeProjectId,
        session,
      });
      loadThreads(activeProjectId);
    } catch (e) {
      console.error("Failed to save thread:", e);
    }
  }

  function newThread() {
    if (!activeProjectId) return;
    const id = generateId();
    setActiveThreadId(id);
    setMessages([]);
    setStreamingText("");
    setProgressLines([]);
    setIsStreaming(false);
  }

  async function selectThread(threadId) {
    if (!activeProjectId) return;
    try {
      const session = await invoke("load_project_thread", {
        projectId: activeProjectId,
        sessionId: threadId,
      });
      if (session) {
        setActiveThreadId(session.id);
        setMessages(session.messages || []);
      }
    } catch (e) {
      console.error("Failed to load thread:", e);
    }
  }

  async function deleteThread(threadId) {
    if (!activeProjectId) return;
    try {
      await invoke("delete_project_thread", {
        projectId: activeProjectId,
        sessionId: threadId,
      });
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
      loadThreads(activeProjectId);
    } catch (e) {
      console.error("Failed to delete thread:", e);
    }
  }

  async function sendMessage(content) {
    if (!content.trim() || isStreaming) return;
    if (!activeProjectId) return;

    let threadId = activeThreadId;
    if (!threadId) {
      threadId = generateId();
      setActiveThreadId(threadId);
    }

    const userMsg = {
      role: "user",
      content: content.trim(),
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsStreaming(true);
    setStreamingText("");
    setProgressLines([]);
    streamingTextRef.current = "";

    // Use opencode CLI if available
    if (opencodeAvailable && activeProject?.directory) {
      try {
        await invoke("send_opencode", {
          request: {
            prompt: content.trim(),
            projectDir: activeProject.directory,
            sessionId: threadId,
            settings,
          },
        });
      } catch (e) {
        setIsStreaming(false);
        const errorMsg = {
          role: "assistant",
          content: `Error: ${e}`,
          timestamp: Date.now(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } else {
      // Fallback to direct LLM streaming
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      try {
        await invoke("send_message", {
          request: {
            messages: apiMessages,
            settings,
            sessionId: threadId,
          },
        });
      } catch (e) {
        setIsStreaming(false);
        const errorMsg = {
          role: "assistant",
          content: `Error: ${e}`,
          timestamp: Date.now(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    }
  }

  async function cancelStream() {
    try {
      if (opencodeAvailable) {
        await invoke("cancel_opencode");
      }
      await invoke("cancel_stream");
    } catch (e) {
      console.error("Failed to cancel:", e);
    }
    setIsStreaming(false);
  }

  async function handleSaveSettings(newSettings) {
    try {
      await invoke("save_settings", { settings: newSettings });
      setSettings(newSettings);
      setShowSettings(false);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }

  async function handleSelectProjectDir() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true });
      if (selected) {
        // Check if project with this dir already exists
        const existing = projects.find((p) => p.directory === selected);
        if (existing) {
          setActiveProjectId(existing.id);
        } else {
          await createProject(selected);
        }
      }
    } catch (e) {
      console.error("Dialog error:", e);
    }
  }

  const hasMessages = messages.length > 0 || isStreaming;

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectProject={setActiveProjectId}
        onNewProject={handleSelectProjectDir}
        onDeleteProject={deleteProject}
        onNewThread={newThread}
        onSelectThread={selectThread}
        onDeleteThread={deleteThread}
        onOpenSettings={() => setShowSettings(true)}
      />
      <main className="main-content">
        <Topbar
          onNewThread={newThread}
          activeProject={activeProject}
          hasProject={!!activeProjectId}
        />
        {hasMessages ? (
          <MessagesArea
            messages={messages}
            isStreaming={isStreaming}
            streamingText={streamingText}
            progressLines={progressLines}
          />
        ) : (
          <WelcomeScreen
            activeProject={activeProject}
            onSelectProject={handleSelectProjectDir}
          />
        )}
        <InputArea
          onSend={sendMessage}
          onCancel={cancelStream}
          isStreaming={isStreaming}
          model={settings.model}
          effort={settings.effort}
          models={models}
          modelsLoading={modelsLoading}
          efforts={EFFORTS}
          onModelChange={(m) => setSettings((s) => ({ ...s, model: m }))}
          onEffortChange={(e) => setSettings((s) => ({ ...s, effort: e }))}
          hasProject={!!activeProjectId}
        />
        <StatusBar
          opencodeAvailable={opencodeAvailable}
          activeProject={activeProject}
        />
      </main>
      {showSettings && (
        <SettingsDialog
          settings={settings}
          models={models}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
