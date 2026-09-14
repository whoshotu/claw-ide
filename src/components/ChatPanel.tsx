import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useAppStore, ChatMessage } from "../store/appStore";

const CHAT_ENDPOINT = "http://127.0.0.1:11434/api/chat";

interface ChatPanelProps {
  isInitialized: boolean;
  tauriApi: any;
}

export function ChatPanel(_props: ChatPanelProps) {
  const { messages, isStreaming, setStreaming, addMessage, updateMessage, permissionMode, model, setPermissionMode, setModel } = useAppStore();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };
    addMessage(userMessage);
    setInput("");
    setStreaming(true);
    setError(null);

    const assistantId = (Date.now() + 1).toString();
    addMessage({ id: assistantId, role: "assistant", content: "", timestamp: Date.now() });

    abortRef.current = new AbortController();

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          model: model,
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!res.ok) throw new Error(`Ollama error: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              accumulated += json.message.content;
              updateMessage(assistantId, accumulated);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ flex: 1, overflow: "auto", padding: "0.75rem" }}>
        {messages.length === 0 && (
          <p style={{ color: "#555", fontSize: "0.85rem" }}>Connected to Ollama · {model}</p>
        )}
        {messages.map((message) => (
          <div key={message.id} style={{ marginBottom: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: "0.25rem" }}>
              {message.role === "user" ? "You" : "Claw"}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#ccc" }}>
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div style={{ margin: "0 0.75rem", padding: "0.5rem", backgroundColor: "rgba(239,68,68,0.2)", color: "#f87171", fontSize: "0.75rem" }}>
          {error}
        </div>
      )}

      <div style={{ padding: "0.75rem", borderTop: "1px solid #3d3d3d" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <select value={permissionMode} onChange={(e) => setPermissionMode(e.target.value)} style={{ background: "#3d3d3d", color: "#ccc", fontSize: "0.75rem", border: "none", padding: "0.25rem" }}>
            <option value="read-only">Read Only</option>
            <option value="workspace-write">Workspace Write</option>
            <option value="danger-full-access">Full Access</option>
          </select>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ background: "#3d3d3d", color: "#ccc", fontSize: "0.75rem", border: "none", padding: "0.25rem" }}>
            <option value="qwen3:8b">Qwen3 8B (Local)</option>
            <option value="glm-5.1:cloud">GLM 5.1</option>
            <option value="kimi-k2.5:cloud">Kimi K2.5</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask claw..."
            style={{ flex: 1, minHeight: "3rem", background: "#3d3d3d", color: "#eee", border: "none", padding: "0.5rem", resize: "none" }}
            disabled={isStreaming}
          />
          <button
            onClick={isStreaming ? handleAbort : handleSend}
            disabled={!input.trim() && !isStreaming}
            style={{ background: isStreaming ? "#dc2626" : "#3b82f6", color: "white", border: "none", padding: "0.5rem", cursor: "pointer" }}
          >
            {isStreaming ? "■" : "→"}
          </button>
        </div>
      </div>
    </div>
  );
}
