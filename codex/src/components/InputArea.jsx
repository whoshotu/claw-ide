import { useState, useRef, useEffect } from "react";

export default function InputArea({
  onSend,
  onCancel,
  isStreaming,
  model,
  effort,
  models,
  modelsLoading,
  efforts,
  onModelChange,
  onEffortChange,
  hasProject,
}) {
  const [text, setText] = useState("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showEffortDropdown, setShowEffortDropdown] = useState(false);
  const textareaRef = useRef(null);
  const modelBtnRef = useRef(null);
  const effortBtnRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [text]);

  useEffect(() => {
    function handleClick(e) {
      if (modelBtnRef.current && !modelBtnRef.current.contains(e.target)) {
        setShowModelDropdown(false);
      }
      if (effortBtnRef.current && !effortBtnRef.current.contains(e.target)) {
        setShowEffortDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    if (isStreaming) {
      onCancel();
      return;
    }
    if (!text.trim() || !hasProject) return;
    onSend(text);
    setText("");
  }

  const modelDisplay =
    models.find((m) => m.id === model)?.name || model || "Select model";
  const effortDisplay =
    efforts.find((e) => e.id === effort)?.name || effort || "High";

  return (
    <div className="input-area">
      <div className="input-container">
        <div className="input-row">
          <button className="attach-btn" title="Attach file">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v8M4 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            className="message-input"
            placeholder={hasProject ? "Ask anything..." : "Select a project first..."}
            rows="1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!hasProject}
          />
          <button
            className={`send-btn ${text.trim() || isStreaming ? "active" : ""} ${isStreaming ? "streaming" : ""}`}
            onClick={handleSend}
            title={isStreaming ? "Stop" : "Send"}
          >
            {isStreaming ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 12V4M4.5 7.5L8 4l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        <div className="input-controls">
          <div className="input-controls-left">
            <div className="dropdown-wrapper" ref={modelBtnRef}>
              <button
                className="control-pill"
                onClick={() => {
                  setShowModelDropdown(!showModelDropdown);
                  setShowEffortDropdown(false);
                }}
              >
                <span>{modelsLoading ? "Loading..." : modelDisplay}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              {showModelDropdown && (
                <div className="dropdown-menu bottom">
                  {models.map((m) => (
                    <div
                      key={m.id}
                      className={`dropdown-item ${model === m.id ? "selected" : ""}`}
                      onClick={() => {
                        onModelChange(m.id);
                        setShowModelDropdown(false);
                      }}
                    >
                      {m.name}
                    </div>
                  ))}
                  {models.length === 0 && (
                    <div className="dropdown-item disabled">
                      {modelsLoading ? "Loading models..." : "Set API key in Settings"}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="dropdown-wrapper" ref={effortBtnRef}>
              <button
                className="control-pill"
                onClick={() => {
                  setShowEffortDropdown(!showEffortDropdown);
                  setShowModelDropdown(false);
                }}
              >
                <span>{effortDisplay}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              {showEffortDropdown && (
                <div className="dropdown-menu bottom">
                  {efforts.map((e) => (
                    <div
                      key={e.id}
                      className={`dropdown-item ${effort === e.id ? "selected" : ""}`}
                      onClick={() => {
                        onEffortChange(e.id);
                        setShowEffortDropdown(false);
                      }}
                    >
                      {e.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="input-controls-right">
            <span className="shortcut-hint">Enter to send</span>
          </div>
        </div>
      </div>
    </div>
  );
}
