import { useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { marked } from "marked";
import hljs from "highlight.js";

marked.setOptions({
  breaks: true,
  gfm: true,
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {}
    }
    return hljs.highlightAuto(code).value;
  },
});

function renderMarkdown(text) {
  return marked.parse(text || "");
}

function copyCode(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function MessageContent({ content, isError }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const pres = ref.current.querySelectorAll("pre");
    pres.forEach((pre) => {
      if (pre.querySelector(".code-header")) return;
      const code = pre.querySelector("code");
      if (!code) return;

      const langClass = Array.from(code.classList).find((c) =>
        c.startsWith("language-")
      );
      const lang = langClass ? langClass.replace("language-", "") : "code";

      const header = document.createElement("div");
      header.className = "code-header";
      header.innerHTML = `<span>${lang}</span><button class="code-copy-btn">Copy</button>`;
      header.querySelector(".code-copy-btn").addEventListener("click", () => {
        copyCode(code.textContent);
        header.querySelector(".code-copy-btn").textContent = "Copied!";
        setTimeout(() => {
          header.querySelector(".code-copy-btn").textContent = "Copy";
        }, 2000);
      });

      pre.insertBefore(header, code);
    });

    ref.current.querySelectorAll("pre code:not(.hljs)").forEach((block) => {
      hljs.highlightElement(block);
    });
  }, [content]);

  if (isError) {
    return <div className="error-message">{content}</div>;
  }

  return (
    <div
      ref={ref}
      className="message-text"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}

const TOOL_ICONS = {
  bash: "terminal",
  read_file: "file",
  write_file: "pencil",
  ls: "folder",
  glob: "search",
  grep: "search",
  patch: "pencil",
};

function getToolLabel(name, input) {
  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    switch (name) {
      case "bash":
        return `$ ${parsed.command || "running command..."}`;
      case "read_file":
        return `Reading ${parsed.path || parsed.file || "file"}`;
      case "write_file":
        return `Writing ${parsed.path || parsed.file || "file"}`;
      case "ls":
        return `Listing ${parsed.path || parsed.dir || "."}`;
      case "glob":
        return `Finding ${parsed.pattern || "files"}`;
      case "grep":
        return `Searching for ${parsed.pattern || "pattern"}`;
      case "patch":
        return `Patching ${parsed.path || parsed.file || "file"}`;
      default:
        return name;
    }
  } catch {
    return name;
  }
}

function ToolCallCard({ activity }) {
  const isRunning = activity.status === "running";
  const label = getToolLabel(activity.name, activity.input);

  return (
    <div className={`tool-call-card ${isRunning ? "running" : "done"}`}>
      <div className="tool-call-header">
        <span className={`tool-icon ${TOOL_ICONS[activity.name] || "gear"}`}>
          {isRunning ? (
            <svg width="14" height="14" viewBox="0 0 14 14" className="spinner-icon">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="20 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="tool-call-label">{label}</span>
      </div>
      {activity.result && (
        <div className="tool-call-result">
          <pre>{activity.result}</pre>
        </div>
      )}
    </div>
  );
}

function StreamingActivity({ activity }) {
  return (
    <div className="streaming-activity">
      {activity.map((item, idx) => {
        if (item.type === "thinking") {
          return (
            <div key={idx} className="thinking-block">
              <span className="thinking-label">Thinking</span>
              <div className="thinking-content">{item.content}</div>
            </div>
          );
        }
        if (item.type === "tool_call") {
          return <ToolCallCard key={item.id || idx} activity={item} />;
        }
        if (item.type === "tool_result") {
          return (
            <div key={idx} className="tool-call-card done">
              <div className="tool-call-header">
                <span className="tool-icon">
                  <svg width="14" height="14" viewBox="0 0 14 14">
                    <path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="tool-call-label">{item.name || "tool"}</span>
              </div>
              <div className="tool-call-result">
                <pre>{item.content}</pre>
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function MessagesArea({ messages, isStreaming, streamingText, streamingActivity, model }) {
  const containerRef = useRef(null);
  const shouldAutoScroll = useRef(true);

  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, streamingText, streamingActivity]);

  function handleScroll() {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 100;
  }

  function handleClick(e) {
    const anchor = e.target.closest("a[href]");
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute("href");
      if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
        open(href).catch(() => {});
      }
    }
  }

  const hasActivity = streamingActivity && streamingActivity.length > 0;
  const assistantLabel = (msgModel) =>
    msgModel ? `OpenCodex (${msgModel})` : "OpenCodex";
  const streamingLabel = assistantLabel(model);

  return (
    <div className="messages-area" ref={containerRef} onScroll={handleScroll} onClick={handleClick}>
      <div className="messages-container">
        {messages.map((msg, idx) => {
          if (msg.role === "compact") {
            return (
              <div key={idx} className="message compact">
                <div className="compact-checkpoint">
                  <div className="compact-divider">
                    <span className="compact-label">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      Conversation compacted
                    </span>
                  </div>
                  <div className="compact-summary">
                    <MessageContent content={msg.content} />
                  </div>
                </div>
              </div>
            );
          }
          if (msg.role === "system") {
            return (
              <div key={idx} className="message system">
                <div className="system-message">
                  <MessageContent content={msg.content} />
                </div>
              </div>
            );
          }
          return (
            <div key={idx} className={`message ${msg.role}`}>
              <div className="message-header">
                <span className="message-role">
                  {msg.role === "user" ? "You" : assistantLabel(msg.model)}
                </span>
              </div>
              <div className="message-content">
                <MessageContent content={msg.content} isError={msg.isError} />
              </div>
            </div>
          );
        })}
        {isStreaming && (hasActivity || streamingText) && (
          <div className="message assistant">
            <div className="message-header">
              <span className="message-role">{streamingLabel}</span>
            </div>
            <div className="message-content">
              {hasActivity && <StreamingActivity activity={streamingActivity} />}
              {streamingText && <MessageContent content={streamingText} />}
            </div>
          </div>
        )}
        {isStreaming && !hasActivity && !streamingText && (
          <div className="message assistant">
            <div className="message-header">
              <span className="message-role">{streamingLabel}</span>
            </div>
            <div className="thinking-indicator">
              <div className="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>Working...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
