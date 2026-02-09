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
import DirectoryPanel from "./components/DirectoryPanel";
import TerminalPanel from "./components/TerminalPanel";
import CommitDialog from "./components/CommitDialog";


const EFFORTS = [
  { id: "none", name: "None" },
  { id: "minimal", name: "Minimal" },
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
  { id: "xhigh", name: "XHigh" },
];

const COMMANDS = [
  { cmd: "/compact", description: "Compact conversation into a summary checkpoint" },
  { cmd: "/clear", description: "Clear all messages in this thread" },
  { cmd: "/help", description: "Show available commands" },
];

function isOpencodeCompatibleModel(provider, model) {
  if (!model) return false;
  if (provider === "openai") {
    return /^(gpt-|o[1-9]|chatgpt-)/.test(model);
  }
  // For now, assume other providers are compatible unless proven otherwise.
  return true;
}

function hasProviderApiKey(settings) {
  switch (settings.provider) {
    case "openai":
      return !!settings.openaiApiKey;
    case "anthropic":
      return !!settings.anthropicApiKey;
    case "gemini":
      return !!settings.geminiApiKey;
    case "azure":
      return !!(settings.azureOpenaiApiKey && settings.azureOpenaiEndpoint);
    default:
      return false;
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function App() {
  const [settings, setSettings] = useState({
    provider: "openai",
    model: "gpt-4.1",
    openaiApiKey: "",
    anthropicApiKey: "",
    geminiApiKey: "",
    azureOpenaiApiKey: "",
    azureOpenaiEndpoint: "",
    effort: "high",
    verbosity: "medium",
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
  const [streamingActivity, setStreamingActivity] = useState([]); // tool calls, thinking
  const [opencodeAvailable, setOpencodeAvailable] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [showDirectory, setShowDirectory] = useState(true);
  const [directoryWidth, setDirectoryWidth] = useState(280);
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState(null);
  const [gitStatus, setGitStatus] = useState(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState("");
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [diffModal, setDiffModal] = useState(null);
  const [diffMode, setDiffMode] = useState("unstaged");
  const [diffText, setDiffText] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState("");
  const streamingTextRef = useRef("");
  const streamingModelRef = useRef("");
  const compactingRef = useRef(false);
  const activeThreadIdRef = useRef(null);
  // Per-thread streaming state: { [sessionId]: { text, model, activity, messages, compacting, isStreaming } }
  const threadStreamsRef = useRef({});

  // Load settings and projects on mount
  useEffect(() => {
    loadSettings();
    loadProjects();
    checkOpenCode();
  }, []);

  // Fetch models when provider or relevant API key changes
  useEffect(() => {
    const keyMap = {
      openai: settings.openaiApiKey,
      anthropic: settings.anthropicApiKey,
      gemini: settings.geminiApiKey,
      azure: settings.azureOpenaiApiKey,
    };
    const key = keyMap[settings.provider] || "";
    if (key || settings.provider === "anthropic") {
      fetchProviderModels(settings.provider, key, settings.azureOpenaiEndpoint || "");
    }
  }, [settings.provider, settings.openaiApiKey, settings.anthropicApiKey, settings.geminiApiKey, settings.azureOpenaiApiKey, settings.azureOpenaiEndpoint]);

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
    activeThreadIdRef.current = null;
    setActiveThreadId(null);
    setMessages([]);
    setStreamingText("");
    setStreamingActivity([]);
    setIsStreaming(false);
  }, [activeProjectId]);

  useEffect(() => {
    if (activeProject?.directory) {
      refreshGitStatus(activeProject.directory);
      setTerminalSessionId(`term-${activeProject.id}`);
    } else {
      setGitStatus(null);
      setGitError("");
      setTerminalSessionId(null);
    }
  }, [activeProject?.directory]);

  useEffect(() => {
    if (!activeProject?.directory) return;
    const interval = setInterval(() => {
      refreshGitStatus(activeProject.directory);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeProject?.directory]);

  async function checkOpenCode() {
    try {
      await invoke("check_opencode");
      setOpencodeAvailable(true);
    } catch {
      setOpencodeAvailable(false);
    }
  }

  async function fetchProviderModels(provider, apiKey, endpoint) {
    setModelsLoading(true);
    try {
      const result = await invoke("fetch_provider_models", {
        provider: provider || "openai",
        apiKey: apiKey || "",
        endpoint: endpoint || "",
      });
      if (result && result.length > 0) {
        setModels(result);
      }
    } catch (e) {
      console.error("Failed to fetch models:", e);
    }
    setModelsLoading(false);
  }

  // Listen for opencode streaming events (session-aware for parallel threads)
  useEffect(() => {
    const unlistenStream = listen("opencode-stream", (event) => {
      const e = event.payload;
      const sid = e.sessionId;
      const isActive = sid === activeThreadIdRef.current;

      if (!isActive) {
        // Background thread — buffer text only
        const ts = threadStreamsRef.current[sid] || { text: "", model: "", isStreaming: true };
        if (e.model) ts.model = e.model;
        if (e.eventType === "text_delta") ts.text = (ts.text || "") + (e.content || "");
        ts.isStreaming = true;
        threadStreamsRef.current[sid] = ts;
        return;
      }

      // Active thread — update UI directly
      if (e.model) {
        streamingModelRef.current = e.model;
      }
      switch (e.eventType) {
        case "text_delta":
          streamingTextRef.current += e.content || "";
          setStreamingText(streamingTextRef.current);
          break;
        case "thinking":
          setStreamingActivity((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.type === "thinking") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + (e.content || "") },
              ];
            }
            return [...prev, { type: "thinking", content: e.content || "" }];
          });
          break;
        case "tool_start":
          setStreamingActivity((prev) => [
            ...prev,
            {
              type: "tool_call",
              name: e.toolName || "",
              id: e.toolId || "",
              input: e.toolInput || "",
              status: "running",
              result: null,
            },
          ]);
          break;
        case "tool_done":
          setStreamingActivity((prev) =>
            prev.map((item) =>
              item.type === "tool_call" && item.id === e.toolId
                ? { ...item, status: "done", input: e.toolInput || item.input }
                : item
            )
          );
          break;
        case "tool_result":
          setStreamingActivity((prev) => {
            const toolCallId = e.toolId;
            const idx = prev.findIndex(
              (item) => item.type === "tool_call" && item.id === toolCallId
            );
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], result: e.content || "", status: "done" };
              return updated;
            }
            return [
              ...prev,
              { type: "tool_result", name: e.toolName || "", content: e.content || "" },
            ];
          });
          break;
      }
    });

    function parseOpencodeOutput(output) {
      let content = output;
      try {
        const parsed = JSON.parse(output);
        if (parsed.message) content = parsed.message;
        else if (parsed.content) content = parsed.content;
        else if (parsed.response) content = parsed.response;
        else content = JSON.stringify(parsed, null, 2);
      } catch {
        // Not JSON, use raw output
      }
      return content;
    }

    const unlistenDone = listen("opencode-done", (event) => {
      const { output, sessionId } = event.payload;
      const content = parseOpencodeOutput(output);
      const isActive = sessionId === activeThreadIdRef.current;

      if (!isActive) {
        // Background thread completed — save pending result
        const ts = threadStreamsRef.current[sessionId] || {};
        ts.isStreaming = false;
        if (ts.compacting) {
          ts.compacting = false;
          ts.pendingCompact = content;
        } else {
          ts.pendingMessages = ts.pendingMessages || [];
          ts.pendingMessages.push({
            role: "assistant",
            content,
            timestamp: Date.now(),
            model: ts.model || "",
          });
        }
        threadStreamsRef.current[sessionId] = ts;
        return;
      }

      const modelUsed = streamingModelRef.current;
      setIsStreaming(false);
      setStreamingText("");
      setStreamingActivity([]);
      streamingTextRef.current = "";
      streamingModelRef.current = "";

      if (compactingRef.current) {
        compactingRef.current = false;
        setMessages([{ role: "compact", content, timestamp: Date.now() }]);
        return;
      }

      setMessages((prev) => [...prev, {
        role: "assistant",
        content,
        timestamp: Date.now(),
        model: modelUsed,
      }]);
    });

    const unlistenError = listen("opencode-error", (event) => {
      const { error, sessionId } = event.payload;
      const isActive = sessionId === activeThreadIdRef.current;

      if (!isActive) {
        // Background thread errored — save pending error
        const ts = threadStreamsRef.current[sessionId] || {};
        ts.isStreaming = false;
        if (ts.compacting) {
          ts.compacting = false;
          ts.pendingMessages = ts.pendingMessages || [];
          ts.pendingMessages.push({
            role: "system",
            content: `Compact failed: ${error}`,
            timestamp: Date.now(),
          });
        } else {
          ts.pendingMessages = ts.pendingMessages || [];
          ts.pendingMessages.push({
            role: "assistant",
            content: `Error: ${error}`,
            timestamp: Date.now(),
            isError: true,
            model: ts.model || "",
          });
        }
        threadStreamsRef.current[sessionId] = ts;
        return;
      }

      const modelUsed = streamingModelRef.current;
      setIsStreaming(false);
      setStreamingText("");
      setStreamingActivity([]);
      streamingTextRef.current = "";
      streamingModelRef.current = "";

      if (compactingRef.current) {
        compactingRef.current = false;
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Compact failed: ${error}`, timestamp: Date.now() },
        ]);
        return;
      }

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Error: ${error}`,
        timestamp: Date.now(),
        isError: true,
        model: modelUsed,
      }]);
    });

    // LLM streaming events as fallback (direct API — updates active thread only)
    const unlistenResponse = listen("stream-response", (event) => {
      const { fullText } = event.payload;
      streamingTextRef.current = fullText;
      setStreamingText(fullText);
    });

    const unlistenStreamDone = listen("stream-done", (event) => {
      const { fullText } = event.payload;
      const modelUsed = streamingModelRef.current;
      setIsStreaming(false);
      setStreamingText("");
      streamingTextRef.current = "";
      streamingModelRef.current = "";

      if (compactingRef.current) {
        compactingRef.current = false;
        setMessages([{ role: "compact", content: fullText, timestamp: Date.now() }]);
        return;
      }

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: fullText,
        timestamp: Date.now(),
        model: modelUsed,
      }]);
    });

    const unlistenStreamError = listen("stream-error", (event) => {
      setIsStreaming(false);
      setStreamingText("");
      streamingTextRef.current = "";

      if (compactingRef.current) {
        compactingRef.current = false;
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Compact failed: ${event.payload.error}`, timestamp: Date.now() },
        ]);
        return;
      }

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Error: ${event.payload.error}`,
        timestamp: Date.now(),
        isError: true,
      }]);
    });

    return () => {
      unlistenStream.then((fn) => fn());
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
    // Save current thread's streaming state (don't cancel it)
    const oldId = activeThreadIdRef.current;
    if (oldId && isStreaming) {
      threadStreamsRef.current[oldId] = {
        text: streamingTextRef.current,
        model: streamingModelRef.current,
        activity: [],  // will keep receiving via events
        isStreaming: true,
        compacting: compactingRef.current,
      };
    }
    const id = generateId();
    activeThreadIdRef.current = id;
    setActiveThreadId(id);
    setMessages([]);
    setStreamingText("");
    setStreamingActivity([]);
    streamingTextRef.current = "";
    streamingModelRef.current = "";
    compactingRef.current = false;
    setIsStreaming(false);
  }

  async function selectThread(threadId) {
    if (!activeProjectId) return;
    // Save current thread's streaming state (don't cancel it)
    const oldId = activeThreadIdRef.current;
    if (oldId && isStreaming) {
      threadStreamsRef.current[oldId] = {
        text: streamingTextRef.current,
        model: streamingModelRef.current,
        activity: [],
        isStreaming: true,
        compacting: compactingRef.current,
      };
    }
    try {
      const session = await invoke("load_project_thread", {
        projectId: activeProjectId,
        sessionId: threadId,
      });
      if (session) {
        activeThreadIdRef.current = session.id;
        setActiveThreadId(session.id);

        let loadedMessages = session.messages || [];
        const saved = threadStreamsRef.current[session.id];

        if (saved) {
          // Apply any pending compact or messages from background completion
          if (saved.pendingCompact) {
            loadedMessages = [{ role: "compact", content: saved.pendingCompact, timestamp: Date.now() }];
            delete saved.pendingCompact;
          } else if (saved.pendingMessages && saved.pendingMessages.length > 0) {
            loadedMessages = [...loadedMessages, ...saved.pendingMessages];
            saved.pendingMessages = [];
          }

          if (saved.isStreaming) {
            // Thread is still streaming in the background — restore live state
            streamingTextRef.current = saved.text || "";
            streamingModelRef.current = saved.model || "";
            compactingRef.current = saved.compacting || false;
            setStreamingText(saved.text || "");
            setStreamingActivity([]);
            setIsStreaming(true);
          } else {
            // Thread finished — clean up
            delete threadStreamsRef.current[session.id];
            streamingTextRef.current = "";
            streamingModelRef.current = "";
            compactingRef.current = false;
            setStreamingText("");
            setStreamingActivity([]);
            setIsStreaming(false);
          }
        } else {
          streamingTextRef.current = "";
          streamingModelRef.current = "";
          compactingRef.current = false;
          setStreamingText("");
          setStreamingActivity([]);
          setIsStreaming(false);
        }

        setMessages(loadedMessages);
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
        activeThreadIdRef.current = null;
        setActiveThreadId(null);
        setMessages([]);
      }
      // Clean up any streaming state for the deleted thread
      delete threadStreamsRef.current[threadId];
      loadThreads(activeProjectId);
    } catch (e) {
      console.error("Failed to delete thread:", e);
    }
  }

  function buildHistoryPrompt(msgs, currentContent) {
    // Find last compact checkpoint
    const lastCompactIdx = msgs.findLastIndex((m) => m.role === "compact");
    const relevant = lastCompactIdx >= 0 ? msgs.slice(lastCompactIdx) : msgs;

    const history = relevant
      .map((m) => {
        if (m.role === "compact") return `[Conversation Summary]: ${m.content}`;
        if (m.role === "system") return null;
        return `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (!history) return currentContent;
    return `<conversation_history>\n${history}\n</conversation_history>\n\nUser: ${currentContent}`;
  }

  async function sendMessage(content) {
    if (!content.trim() || isStreaming) return;
    if (!activeProjectId) return;

    const trimmed = content.trim();

    // --- Command handling ---
    if (trimmed.startsWith("/")) {
      const cmd = trimmed.split(" ")[0].toLowerCase();

      if (cmd === "/clear") {
        setMessages([]);
        return;
      }

      if (cmd === "/help") {
        const helpText = COMMANDS.map((c) => `**${c.cmd}** — ${c.description}`).join("\n");
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Available commands:\n${helpText}`, timestamp: Date.now() },
        ]);
        return;
      }

      if (cmd === "/compact") {
        if (messages.length < 2) {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: "Not enough messages to compact.", timestamp: Date.now() },
          ]);
          return;
        }

        compactingRef.current = true;

        const history = messages
          .map((m) => {
            if (m.role === "compact") return `[Previous Summary]: ${m.content}`;
            if (m.role === "system") return null;
            return `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`;
          })
          .filter(Boolean)
          .join("\n\n");

        const compactPrompt =
          "Provide a concise but comprehensive summary of the following conversation. " +
          "Focus on: key decisions made, important information shared (names, preferences, requirements), " +
          "current state of ongoing work, and any pending tasks. Write ONLY the summary, no preamble.\n\n" +
          history;

        // Show working indicator
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "Compacting conversation...", timestamp: Date.now() },
        ]);
        setIsStreaming(true);
        setStreamingText("");
        setStreamingActivity([]);
        streamingTextRef.current = "";

        let threadId = activeThreadId || generateId();
        if (!activeThreadId) {
          activeThreadIdRef.current = threadId;
          setActiveThreadId(threadId);
        }

        if (opencodeAvailable && activeProject?.directory) {
          try {
            await invoke("send_opencode", {
              request: {
                prompt: compactPrompt,
                projectDir: activeProject.directory,
                sessionId: threadId,
                settings,
              },
            });
          } catch (e) {
            compactingRef.current = false;
            setIsStreaming(false);
            setMessages((prev) => [
              ...prev,
              { role: "system", content: `Compact failed: ${e}`, timestamp: Date.now() },
            ]);
          }
        } else {
          try {
            await invoke("send_message", {
              request: {
                messages: [{ role: "user", content: compactPrompt }],
                settings,
                sessionId: threadId,
              },
            });
          } catch (e) {
            compactingRef.current = false;
            setIsStreaming(false);
            setMessages((prev) => [
              ...prev,
              { role: "system", content: `Compact failed: ${e}`, timestamp: Date.now() },
            ]);
          }
        }
        return;
      }

      // Unknown command
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Unknown command: ${cmd}. Type /help for available commands.`, timestamp: Date.now() },
      ]);
      return;
    }

    // --- Normal message handling ---
    let threadId = activeThreadId;
    if (!threadId) {
      threadId = generateId();
      activeThreadIdRef.current = threadId;
      setActiveThreadId(threadId);
    }

    const userMsg = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      model: settings.model,
      effort: settings.effort,
      verbosity: settings.verbosity,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsStreaming(true);
    setStreamingText("");
    setStreamingActivity([]);
    streamingTextRef.current = "";
    streamingModelRef.current = settings.model;

    const opencodeEligible = opencodeAvailable && activeProject?.directory;
    const opencodeModelOk = isOpencodeCompatibleModel(settings.provider, settings.model);
    const shouldUseOpencode = opencodeEligible && opencodeModelOk;

    if (opencodeEligible && !opencodeModelOk) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content:
            `Selected model "${settings.model}" is not supported by the opencode CLI for ${settings.provider} (chat/completions only). ` +
            "Falling back to direct API streaming (tools disabled).",
          timestamp: Date.now(),
        },
      ]);
    }

    // Use opencode CLI if available and model is compatible
    if (shouldUseOpencode) {
      try {
        const fullPrompt = buildHistoryPrompt(messages, trimmed);
        await invoke("send_opencode", {
          request: {
            prompt: fullPrompt,
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
          model: settings.model,
          effort: settings.effort,
          verbosity: settings.verbosity,
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } else {
      if (!hasProviderApiKey(settings)) {
        setIsStreaming(false);
        setStreamingText("");
        streamingTextRef.current = "";
        const errorMsg = {
          role: "assistant",
          content: `Error: Missing API key for ${settings.provider}. Configure it in Settings.`,
          timestamp: Date.now(),
          isError: true,
          model: settings.model,
          effort: settings.effort,
          verbosity: settings.verbosity,
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      // Fallback to direct LLM streaming — pass full message array for native context
      const lastCompactIdx = newMessages.findLastIndex((m) => m.role === "compact");
      let apiMessages;
      if (lastCompactIdx >= 0) {
        const compactMsg = newMessages[lastCompactIdx];
        const afterCompact = newMessages.slice(lastCompactIdx + 1);
        apiMessages = [
          { role: "system", content: `Previous conversation summary:\n${compactMsg.content}` },
          ...afterCompact
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        ];
      } else {
        apiMessages = newMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.content }));
      }
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
          model: settings.model,
          effort: settings.effort,
          verbosity: settings.verbosity,
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    }
  }

  async function cancelStream() {
    const sid = activeThreadIdRef.current;
    try {
      if (opencodeAvailable && sid) {
        await invoke("cancel_opencode", { sessionId: sid });
      }
      await invoke("cancel_stream");
    } catch (e) {
      console.error("Failed to cancel:", e);
    }
    if (sid) {
      delete threadStreamsRef.current[sid];
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

  async function refreshGitStatus(dirPath) {
    if (!dirPath) return;
    setGitLoading(true);
    setGitError("");
    try {
      const status = await invoke("git_status", { repoPath: dirPath });
      setGitStatus(status);
    } catch (e) {
      setGitError(String(e));
      setGitStatus(null);
    } finally {
      setGitLoading(false);
    }
  }

  async function stageFile(repoPath, filePath) {
    if (!repoPath || !filePath) return;
    try {
      await invoke("git_stage_file", { repoPath, filePath });
      await refreshGitStatus(repoPath);
    } catch (e) {
      setGitError(String(e));
    }
  }

  async function unstageFile(repoPath, filePath) {
    if (!repoPath || !filePath) return;
    try {
      await invoke("git_unstage_file", { repoPath, filePath });
      await refreshGitStatus(repoPath);
    } catch (e) {
      setGitError(String(e));
    }
  }

  async function discardFile(repoPath, filePath, fileStatus) {
    if (!repoPath || !filePath) return;
    try {
      const isUntracked = fileStatus === "untracked";
      await invoke("git_discard_file", { repoPath, filePath, isUntracked });
      await refreshGitStatus(repoPath);
    } catch (e) {
      setGitError(String(e));
    }
  }

  async function stageAll(repoPath) {
    if (!repoPath) return;
    try {
      await invoke("git_stage_all", { repoPath });
      await refreshGitStatus(repoPath);
    } catch (e) {
      setGitError(String(e));
    }
  }

  async function unstageAll(repoPath) {
    if (!repoPath) return;
    try {
      await invoke("git_unstage_all", { repoPath });
      await refreshGitStatus(repoPath);
    } catch (e) {
      setGitError(String(e));
    }
  }

  async function listBranches() {
    if (!activeProject?.directory) return { current: "", branches: [] };
    try {
      return await invoke("git_list_branches", { repoPath: activeProject.directory });
    } catch (e) {
      console.error("Failed to list branches:", e);
      return { current: "", branches: [] };
    }
  }

  async function createBranch(branchName) {
    if (!activeProject?.directory) return;
    await invoke("git_create_branch", { repoPath: activeProject.directory, branchName });
    await refreshGitStatus(activeProject.directory);
  }

  async function switchBranch(branchName) {
    if (!activeProject?.directory) return;
    await invoke("git_switch_branch", { repoPath: activeProject.directory, branchName });
    await refreshGitStatus(activeProject.directory);
  }

  async function handleCommit({ message, includeUnstaged, push }) {
    if (!activeProject?.directory) {
      throw new Error("No active project selected.");
    }
    if (!message) {
      throw new Error("Commit message is required.");
    }
    await invoke("git_commit", {
      repoPath: activeProject.directory,
      message,
      includeUnstaged,
      push,
    });
    await refreshGitStatus(activeProject.directory);
  }

  async function generateCommitMessage(includeUnstaged) {
    if (!activeProject?.directory) {
      throw new Error("No active project selected.");
    }
    return await invoke("generate_commit_message", {
      repoPath: activeProject.directory,
      includeUnstaged,
      settings,
    });
  }

  function openDiffModal(filePath) {
    if (!gitStatus || !activeProject?.directory) return;
    const hasStaged = (gitStatus.staged || []).some((f) => f.path === filePath);
    const hasUnstaged = (gitStatus.unstaged || []).some((f) => f.path === filePath);
    const mode = hasUnstaged ? "unstaged" : "staged";
    setDiffMode(mode);
    setDiffModal({
      path: filePath,
      hasStaged,
      hasUnstaged,
    });
  }

  async function fetchDiff(mode, filePath) {
    if (!activeProject?.directory || !filePath) return;
    setDiffLoading(true);
    setDiffError("");
    try {
      const unstagedEntry = (gitStatus?.unstaged || []).find((f) => f.path === filePath);
      const stagedEntry = (gitStatus?.staged || []).find((f) => f.path === filePath);
      const status =
        mode === "staged" ? stagedEntry?.status : unstagedEntry?.status;
      const isNew = status === "untracked";
      const diff = await invoke("git_diff", {
        repoPath: activeProject.directory,
        filePath,
        staged: mode === "staged",
        isNew,
      });
      setDiffText(diff || "");
    } catch (e) {
      setDiffError(String(e));
      setDiffText("");
    } finally {
      setDiffLoading(false);
    }
  }

  useEffect(() => {
    if (!diffModal?.path) return;
    fetchDiff(diffMode, diffModal.path);
  }, [diffModal?.path, diffMode, activeProject?.directory]);

  function handleSidebarResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    function onMove(ev) {
      const w = Math.min(400, Math.max(180, startW + ev.clientX - startX));
      setSidebarWidth(w);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function handleDirectoryResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = directoryWidth;
    function onMove(ev) {
      const w = Math.min(500, Math.max(200, startW + startX - ev.clientX));
      setDirectoryWidth(w);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const hasMessages = messages.length > 0 || isStreaming;

  // Check if the current provider has an API key configured (or opencode is available)
  const hasApiKey = (() => {
    if (opencodeAvailable && isOpencodeCompatibleModel(settings.provider, settings.model)) {
      return true;
    }
    return hasProviderApiKey(settings);
  })();

  const gitSummary = gitStatus
    ? {
        isRepo: gitStatus.isRepo,
        additions:
          (gitStatus.stagedAdditions || 0) + (gitStatus.unstagedAdditions || 0),
        deletions:
          (gitStatus.stagedDeletions || 0) + (gitStatus.unstagedDeletions || 0),
        hasChanges:
          (gitStatus.staged?.length || 0) + (gitStatus.unstaged?.length || 0) >
          0,
      }
    : null;

  return (
    <div className="app">
      {showSidebar && (
        <>
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
            style={{ width: sidebarWidth, minWidth: sidebarWidth }}
          />
          <div
            className="resize-handle-h"
            onPointerDown={handleSidebarResize}
          />
        </>
      )}
      <main className="main-content">
        <Topbar
          onNewThread={newThread}
          activeProject={activeProject}
          hasProject={!!activeProjectId}
          onToggleSidebar={() => setShowSidebar((prev) => !prev)}
          isSidebarOpen={showSidebar}
          onToggleDirectory={() => setShowDirectory((prev) => !prev)}
          onToggleTerminal={() => setShowTerminal((prev) => !prev)}
          isDirectoryOpen={showDirectory}
          isTerminalOpen={showTerminal}
          gitSummary={gitSummary}
          onOpenCommit={() => setShowCommitDialog(true)}
        />
        <div className="content-stack">
          {hasMessages ? (
            <MessagesArea
              messages={messages}
              isStreaming={isStreaming}
              streamingText={streamingText}
              streamingActivity={streamingActivity}
              model={settings.model}
            />
          ) : (
            <WelcomeScreen
              activeProject={activeProject}
              onSelectProject={handleSelectProjectDir}
            />
          )}
        </div>
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
          hasApiKey={hasApiKey}
          commands={COMMANDS}
        />
        <TerminalPanel
          activeProject={activeProject}
          sessionId={terminalSessionId}
          isOpen={showTerminal}
        />
        <StatusBar
          opencodeAvailable={opencodeAvailable}
          activeProject={activeProject}
          gitStatus={gitStatus}
          onListBranches={listBranches}
          onCreateBranch={createBranch}
          onSwitchBranch={switchBranch}
        />
      </main>
      {showDirectory && (
        <>
          <div
            className="resize-handle-h"
            onPointerDown={handleDirectoryResize}
          />
          <DirectoryPanel
            activeProject={activeProject}
            gitStatus={gitStatus}
            gitLoading={gitLoading}
            gitError={gitError}
            onRefreshGit={() => refreshGitStatus(activeProject?.directory)}
            onStageFile={(path) => stageFile(activeProject?.directory, path)}
            onUnstageFile={(path) => unstageFile(activeProject?.directory, path)}
            onDiscardFile={(path, status) => discardFile(activeProject?.directory, path, status)}
            onStageAll={() => stageAll(activeProject?.directory)}
            onUnstageAll={() => unstageAll(activeProject?.directory)}
            onSelectFile={openDiffModal}
            diffFile={diffModal?.path || null}
            diffText={diffText}
            diffLoading={diffLoading}
            diffError={diffError}
            diffMode={diffMode}
            diffHasStaged={diffModal?.hasStaged || false}
            diffHasUnstaged={diffModal?.hasUnstaged || false}
            onDiffModeChange={(mode) => setDiffMode(mode)}
            onCloseDiff={() => {
              setDiffModal(null);
              setDiffText("");
              setDiffError("");
            }}
            style={{ width: directoryWidth, minWidth: directoryWidth }}
          />
        </>
      )}
      {showCommitDialog && gitStatus?.isRepo && (
        <CommitDialog
          gitStatus={gitStatus}
          onCommit={handleCommit}
          onClose={() => setShowCommitDialog(false)}
          onGenerateMessage={generateCommitMessage}
        />
      )}
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
