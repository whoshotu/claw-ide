import { useEffect, useRef } from "react";
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

export default function MessagesArea({ messages, isStreaming, streamingText, progressLines }) {
  const containerRef = useRef(null);
  const shouldAutoScroll = useRef(true);

  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, streamingText, progressLines]);

  function handleScroll() {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 100;
  }

  return (
    <div className="messages-area" ref={containerRef} onScroll={handleScroll}>
      <div className="messages-container">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-header">
              <span className="message-role">
                {msg.role === "user" ? "You" : "Codex"}
              </span>
            </div>
            <div className="message-content">
              <MessageContent content={msg.content} isError={msg.isError} />
            </div>
          </div>
        ))}
        {isStreaming && streamingText && (
          <div className="message assistant">
            <div className="message-header">
              <span className="message-role">Codex</span>
            </div>
            <div className="message-content">
              <MessageContent content={streamingText} />
            </div>
          </div>
        )}
        {isStreaming && !streamingText && (
          <div className="message assistant">
            <div className="message-header">
              <span className="message-role">Codex</span>
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
