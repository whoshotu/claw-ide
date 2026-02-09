import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

const DEFAULT_COLS = 96;
const DEFAULT_ROWS = 28;

export default function TerminalPanel({ activeProject, sessionId, isOpen }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const sessionRef = useRef(sessionId);
  const lastStartRef = useRef({ sessionId: null, cwd: null });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (terminalRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      theme: {
        background: "#0c0c0c",
        foreground: "#d6d6d6",
        cursor: "#d6d6d6",
      },
      allowTransparency: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    if (containerRef.current) {
      term.open(containerRef.current);
    }

    term.onData((data) => {
      const targetSession = sessionRef.current;
      if (!targetSession) return;
      invoke("terminal_write", { sessionId: targetSession, data }).catch(() => {});
    });

    return () => {
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    const disposeOutput = listen("terminal-output", (event) => {
      const payload = event.payload || {};
      if (payload.sessionId !== sessionRef.current) return;
      terminalRef.current?.write(payload.data || "");
    });

    const disposeExit = listen("terminal-exit", (event) => {
      const payload = event.payload || {};
      if (payload.sessionId !== sessionRef.current) return;
      terminalRef.current?.write("\r\n[terminal closed]\r\n");
    });

    return () => {
      disposeOutput.then((fn) => fn());
      disposeExit.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (!activeProject?.directory || !sessionId) {
      setStatus("idle");
      setError("Open a project to start a terminal.");
      return;
    }

    let cancelled = false;
    setError("");
    setStatus("connecting");

    const startTerminal = async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      fitAddonRef.current?.fit();
      const dims = fitAddonRef.current?.proposeDimensions();
      const cols = dims?.cols || DEFAULT_COLS;
      const rows = dims?.rows || DEFAULT_ROWS;
      const shouldReset =
        lastStartRef.current.sessionId !== sessionId ||
        lastStartRef.current.cwd !== activeProject.directory;
      if (shouldReset) {
        terminalRef.current?.reset();
      }
      await invoke("terminal_start", {
        sessionId,
        cwd: activeProject.directory,
        cols,
        rows,
      });
      lastStartRef.current = { sessionId, cwd: activeProject.directory };
      if (cancelled) return;
      setStatus("ready");
      terminalRef.current?.focus();
    };

    startTerminal().catch((err) => {
      if (cancelled) return;
      setStatus("error");
      setError(String(err));
    });

    return () => {
      cancelled = true;
    };
  }, [activeProject?.directory, isOpen, sessionId]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container || !fitAddonRef.current) return;

    const observer = new ResizeObserver(() => {
      if (!isOpen) return;
      const dims = fitAddonRef.current?.proposeDimensions();
      if (!dims || dims.cols <= 0 || dims.rows <= 0) return;
      fitAddonRef.current?.fit();
      const targetSession = sessionRef.current;
      if (!targetSession) return;
      invoke("terminal_resize", {
        sessionId: targetSession,
        cols: dims.cols,
        rows: dims.rows,
      }).catch(() => {});
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isOpen]);

  return (
    <section className={`terminal-panel ${isOpen ? "is-open" : ""}`}>
      <div className="terminal-header">
        <span>Terminal</span>
        {activeProject?.directory && (
          <span className="terminal-path" title={activeProject.directory}>
            {activeProject.directory}
          </span>
        )}
      </div>
      <div className="terminal-body">
        <div className="terminal-xterm" ref={containerRef} />
        {error && <div className="terminal-placeholder error">{error}</div>}
        {!error && status === "connecting" && (
          <div className="terminal-placeholder">Starting terminal...</div>
        )}
        {!error && !activeProject?.directory && (
          <div className="terminal-placeholder">Open a project to start a terminal.</div>
        )}
      </div>
    </section>
  );
}
