import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AgentBackend, ChatMessage, useAppStore } from "../store/appStore";

interface ChatPanelProps {
  isInitialized: boolean;
  tauriApi: any;
}

interface EditProposal {
  path: string;
  content: string;
}

interface ToolRequest {
  name: string;
  command: string;
}

const EDIT_PATTERN = /<claw-edit\s+path="([^"]+)">([\s\S]*?)<\/claw-edit>/g;
const TOOL_PATTERN = /<dots_function_call>\s*<invoke\s+name="([^"]+)">\s*<parameter\s+name="command">([\s\S]*?)<\/parameter>\s*<\/invoke>\s*<\/dots_function_call>/i;
const cleanAssistantContent = (content: string) =>
  content.replace(TOOL_PATTERN, "").replace(/<dots_function_call>[\s\S]*?<\/dots_function_call>/gi, "").trim();

export function ChatPanel({ tauriApi }: ChatPanelProps) {
  const {
    messages,
    isStreaming,
    setStreaming,
    addMessage,
    updateMessage,
    permissionMode,
    setPermissionMode,
    model,
    setModel,
    apiProvider,
    apiBaseUrl,
    apiKey,
    currentDirectory,
    activeFilePath,
    openFiles,
    openFile,
    updateFileContent,
    markFileClean,
    agentBackend,
    setAgentBackend,
    agentTeam,
  } = useAppStore();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<EditProposal | null>(null);
  const [toolRequest, setToolRequest] = useState<ToolRequest | null>(null);
  const [agentStatus, setAgentStatus] = useState("Select an agent");
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const trustedHostsRef = useRef(new Set<string>());

  useEffect(() => {
    if (agentBackend === "provider") {
      setAgentStatus(`${apiProvider} provider`);
      return;
    }
    const command = agentBackend === "claw-code" ? "find_claw_binary" : "find_openclaw_gateway";
    if (!tauriApi?.invoke) {
      setAgentStatus("Desktop runtime is not connected");
      return;
    }
    void tauriApi.invoke(command)
      .then((path: string) => setAgentStatus(`${agentBackend === "claw-code" ? "ClawCode" : "ClawBot"} available: ${path}`))
      .catch(() => setAgentStatus(`${agentBackend === "claw-code" ? "ClawCode" : "ClawBot"} is not available`));
  }, [agentBackend, apiProvider, tauriApi]);

  const runtimeLabel = (status: string) =>
    status === "ready" ? "Ready" :
    status === "degraded" ? "Degraded" :
    status === "unavailable" ? "Unavailable" : "Starting";

  const refreshAgentTeam = async () => {
    if (!tauriApi?.invoke) return;
    try {
      const team = await tauriApi.invoke("refresh_agent_harness", {
        apiConfigured: apiProvider === "ollama" || Boolean(apiKey),
      });
      useAppStore.getState().setAgentTeam(team);
      setError(null);
    } catch (cause) {
      setError(`Agent health check failed: ${String(cause)}`);
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const persistSettings = async (next: Record<string, string>) => {
    if (!tauriApi?.invoke) return;
    try {
      await tauriApi.invoke("write_settings", {
        settings: { apiProvider, apiBaseUrl, apiKey, model, permissionMode, ...next },
      });
    } catch (cause) {
      console.error("Failed to persist settings:", cause);
    }
  };

  const getContextMessage = () => {
    const activeFile = openFiles.find((file) => file.path === activeFilePath);
    const fileContext = activeFile
      ? `\nActive file: ${activeFile.path}\n<active-file>\n${activeFile.content.slice(0, 30000)}\n</active-file>`
      : "\nNo file is currently open.";
    return `You are an editing agent inside Claw IDE. Workspace: ${currentDirectory || "not selected"}.
The user reviews edits before they are written. When the user requests a file change, respond with a concise explanation and one or more exact edit blocks in this format:
<claw-edit path="relative/or/absolute/path">
complete file content
</claw-edit>
Only include an edit block when you are proposing a change. Never claim a file was changed until the user applies the proposal.${fileContext}`;
  };

  const applyProposal = async () => {
    if (!proposal || !tauriApi?.invoke) return;
    const path = proposal.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(proposal.path)
      ? proposal.path
      : `${currentDirectory.replace(/[\\/]$/, "")}/${proposal.path}`;
    try {
      await tauriApi.invoke("write_file", { path, content: proposal.content });
      const existing = openFiles.find((file) => file.path === path);
      if (existing) {
        updateFileContent(path, proposal.content);
        markFileClean(path);
      } else {
        openFile(path, proposal.content);
        markFileClean(path);
      }
      setProposal(null);
      setError(null);
    } catch (cause) {
      setError(`Could not apply edit: ${String(cause)}`);
    }
  };

  const send = async () => {
    const content = input.trim();
    if (!content || isStreaming) return;
    if (agentBackend === "provider" && apiProvider !== "ollama" && !apiKey.trim()) {
      setError("Add an API key in Settings before using this provider.");
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    const assistantId = `${Date.now()}-assistant`;
    addMessage(userMessage);
    addMessage({ id: assistantId, role: "assistant", content: "", timestamp: Date.now() });
    setInput("");
    setError(null);
    setProposal(null);
    setToolRequest(null);
    setStreaming(true);
    abortRef.current = new AbortController();

    if (agentBackend !== "provider") {
      try {
        const adapterPrompt = `${getContextMessage()}\n\nUser request:\n${content}`;
        const result = await tauriApi.invoke("run_agent_prompt", {
          backend: agentBackend,
          prompt: adapterPrompt,
          cwd: currentDirectory,
        });
        updateMessage(assistantId, String(result));
      } catch (cause) {
        updateMessage(assistantId, "");
        setError(`${agentBackend === "claw-code" ? "ClawCode" : "ClawBot"} adapter failed: ${String(cause)}`);
      } finally {
        setStreaming(false);
      }
      return;
    }

    const baseUrl = (apiBaseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
    const isOllama = apiProvider === "ollama";
    const endpoint = isOllama ? `${baseUrl}/api/chat` : `${baseUrl}/chat/completions`;
    const requestMessages = [
      { role: "system" as const, content: getContextMessage() },
      ...messages,
      userMessage,
    ].map(({ role, content: messageContent }) => ({ role, content: messageContent }));

    try {
      const endpointUrl = new URL(endpoint);
      if (endpointUrl.protocol === "https:" && !trustedHostsRef.current.has(endpointUrl.host)) {
        const trusted = window.confirm(
          `Do you trust this API host?\n\n${endpointUrl.host}\n\nAllow Claw IDE to send your prompt and API key to this provider?`,
        );
        if (!trusted) {
          throw new Error("Request cancelled because the API host was not trusted.");
        }
        trustedHostsRef.current.add(endpointUrl.host);
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!isOllama) {
        headers.Authorization = `Bearer ${apiKey}`;
        if (apiProvider === "openrouter") {
          headers["HTTP-Referer"] = "https://claw-ide.local";
          headers["X-Title"] = "Claw IDE";
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        signal: abortRef.current.signal,
        body: JSON.stringify({ model, messages: requestMessages, stream: true }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`${apiProvider} error: ${response.status}${detail ? ` - ${detail}` : ""}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream received.");
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const payload = isOllama
              ? JSON.parse(trimmed).message?.content
              : trimmed.startsWith("data:")
                ? JSON.parse(trimmed.replace(/^data:\s*/, ""))?.choices?.[0]?.delta?.content
                : undefined;
            if (typeof payload === "string") {
              accumulated += payload;
              updateMessage(assistantId, accumulated);
            }
          } catch {
            // Streaming chunks can be split across network packets.
          }
        }
      }

      const edits = [...accumulated.matchAll(EDIT_PATTERN)];
      if (edits.length > 0) {
        const [path, editContent] = edits[0].slice(1) as [string, string];
        setProposal({ path, content: editContent.replace(/^\n|\n$/g, "") });
      }
      const tool = accumulated.match(TOOL_PATTERN);
      if (tool) {
        setToolRequest({ name: tool[1], command: tool[2].trim() });
        updateMessage(assistantId, cleanAssistantContent(accumulated) || "I requested a local tool action.");
      }
    } catch (cause: any) {
      if (cause?.name !== "AbortError") setError(String(cause));
    } finally {
      setStreaming(false);
    }
  };

  const approveToolRequest = async () => {
    if (!toolRequest || !tauriApi?.invoke) return;
    try {
      const result = await tauriApi.invoke("execute_terminal", { command: toolRequest.command, cwd: currentDirectory });
      addMessage({
        id: `${Date.now()}-tool-result`,
        role: "system",
        content: `Tool result (${toolRequest.name}):\n\n${result.output || "(no output)"}\n\nExit code: ${result.exit_code ?? "unknown"}`,
        timestamp: Date.now(),
      });
      setToolRequest(null);
    } catch (cause) {
      setError(`Tool failed: ${String(cause)}`);
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-toolbar">
        <div><strong>Claw Chat</strong><span>{agentStatus}</span></div>
        <button onClick={() => useAppStore.setState({ messages: [] })} disabled={isStreaming}>Clear</button>
      </div>
      <div className="agent-team-status">
        <div className="agent-team-heading"><strong>Agent team</strong><span>{agentTeam.message}</span><button onClick={() => void refreshAgentTeam()} disabled={isStreaming}>Refresh</button></div>
        <div className="agent-runtime-list">
          <span className={`agent-runtime ${agentTeam.clawCode}`}><i />ClawCode · {runtimeLabel(agentTeam.clawCode)}</span>
          <span className={`agent-runtime ${agentTeam.clawBot}`}><i />ClawBot · {runtimeLabel(agentTeam.clawBot)}</span>
          <span className={`agent-runtime ${agentTeam.apiBackup}`}><i />API backup · {runtimeLabel(agentTeam.apiBackup)}</span>
        </div>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty"><div className="chat-empty-icon">✦</div><strong>What can I help you build?</strong><span>Ask for an explanation, search, or a reviewed file edit.</span></div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`chat-message chat-message-${message.role}`}>
            <div className="chat-message-label">{message.role === "user" ? "You" : message.role === "system" ? "Tool" : "Claw"}</div>
            <div className="chat-message-content"><ReactMarkdown>{message.role === "assistant" ? cleanAssistantContent(message.content) : message.content}</ReactMarkdown></div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {toolRequest && (
        <div className="tool-approval-card">
          <strong>Permission required · {toolRequest.name}</strong>
          <p>This model requested a local terminal command. Review it before execution.</p>
          <code>{toolRequest.command}</code>
          <div className="tool-approval-actions">
            <button onClick={() => void approveToolRequest()}>Allow once</button>
            <button onClick={() => setToolRequest(null)}>Reject</button>
          </div>
        </div>
      )}

      {proposal && (
        <div style={{ margin: "0 0.75rem 0.5rem", padding: "0.65rem", background: "rgba(59,130,246,0.12)", border: "1px solid #3b82f6", borderRadius: "4px" }}>
          <div style={{ color: "#93c5fd", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            Edit proposal: {proposal.path}
          </div>
          <pre style={{ maxHeight: "140px", overflow: "auto", whiteSpace: "pre-wrap", color: "#ccc", fontSize: "0.75rem" }}>{proposal.content}</pre>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button onClick={() => void applyProposal()}>Apply edit</button>
            <button onClick={() => setProposal(null)}>Reject</button>
          </div>
        </div>
      )}

      {error && <div style={{ margin: "0 0.75rem", padding: "0.5rem", color: "#f87171" }}>{error}</div>}
      <div style={{ padding: "0.75rem", borderTop: "1px solid #3d3d3d" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <select
            value={agentBackend}
            onChange={(event) => setAgentBackend(event.target.value as AgentBackend)}
            title={agentStatus}
          >
            <option value="provider">API Provider</option>
            <option value="claw-code">ClawCode runtime</option>
            <option value="clawbot">ClawBot / OpenClaw</option>
          </select>
          <select value={permissionMode} onChange={async (event) => {
            const value = event.target.value;
            setPermissionMode(value);
            await persistSettings({ permissionMode: value });
          }}>
            <option value="read-only">Read Only</option>
            <option value="workspace-write">Workspace Write</option>
            <option value="danger-full-access">Full Access</option>
          </select>
          <select value={model} onChange={async (event) => {
            const value = event.target.value;
            setModel(value);
            await persistSettings({ model: value });
          }}>
            <option value="qwen3:8b">Qwen3 8B (Local)</option>
            <option value="gpt-4o-mini">GPT-4o mini</option>
            <option value="gpt-4.1-mini">GPT-4.1 mini</option>
            <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
            <option value="openrouter/free">OpenRouter Free</option>
          </select>
        </div>
        <div style={{ color: "#777", fontSize: "0.7rem", marginBottom: "0.5rem" }}>{agentStatus}</div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Ask claw to explain or edit the active file..."
            disabled={isStreaming}
            style={{ flex: 1, minHeight: "3rem", background: "#3d3d3d", color: "#eee", border: "none", padding: "0.5rem", resize: "none" }}
          />
          <button
            onClick={() => {
              if (isStreaming) {
                abortRef.current?.abort();
                setStreaming(false);
              } else {
                void send();
              }
            }}
            disabled={!input.trim() && !isStreaming}
          >
            {isStreaming ? "■" : "→"}
          </button>
        </div>
      </div>
    </div>
  );
}
