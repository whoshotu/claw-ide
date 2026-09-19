import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface TerminalPanelProps {
  tauriApi: any;
  cwd: string;
}

interface TerminalLine {
  command?: string;
  output: string;
  exitCode?: number | null;
}

export function TerminalPanel({ tauriApi, cwd }: TerminalPanelProps) {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [running, setRunning] = useState(false);
  const [processId, setProcessId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<{ pid: number; output: string; done: boolean; exit_code: number | null }>("process-output", (event) => {
      if (event.payload.pid !== processId) return;
      if (event.payload.output) {
        setLines((previous) => [...previous, { output: event.payload.output }]);
      }
      if (event.payload.done) {
        setLines((previous) => [...previous, { output: `Process exited with code ${event.payload.exit_code ?? "unknown"}`, exitCode: event.payload.exit_code }]);
        setRunning(false);
        setProcessId(null);
        inputRef.current?.focus();
      }
    }).then((cleanup) => { unlisten = cleanup; }).catch((cause) => {
      setError(`Terminal event listener unavailable: ${String(cause)}`);
    });
    return () => { unlisten?.(); };
  }, [processId]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [lines]);

  const runCommand = async () => {
    const value = command.trim();
    if (!value || running) return;
    if (!tauriApi?.invoke) {
      setError("Tauri backend is not available.");
      return;
    }

    setRunning(true);
    setError(null);
    setCommand("");
    try {
      const pid = await tauriApi.invoke("start_terminal_process", { command: value, cwd });
      setProcessId(pid);
      setLines((previous) => [...previous, { command: value, output: `Process started (pid ${pid})` }]);
    } catch (e) {
      setError(String(e));
    }
  };

  const stopCommand = async () => {
    if (processId === null) return;
    try {
      await tauriApi.invoke("stop_terminal_process", { pid: processId });
    } catch (e) {
      setError(`Could not stop terminal process: ${String(e)}`);
      setRunning(false);
      setProcessId(null);
    }
  };

  return (
    <section className="terminal-panel">
      <div className="terminal-header">
        <span>TERMINAL</span>
        <span className="terminal-cwd">{cwd || "No workspace selected"}</span>
        {processId !== null && <button onClick={() => void stopCommand()}>Stop</button>}
        <button onClick={() => setLines([])} disabled={running}>Clear</button>
      </div>
      <div className="terminal-output" ref={outputRef}>
        {lines.length === 0 && (
          <div className="terminal-placeholder">
            Run local commands here. The agent can use this same workspace terminal when a command is explicitly requested.
          </div>
        )}
        {lines.map((line, index) => (
          <div key={`${line.command}-${index}`} className="terminal-entry">
            <div className="terminal-command">$ {line.command}</div>
            <pre>{line.output}</pre>
            {line.exitCode !== 0 && (
              <div className="terminal-error">Process exited with code {line.exitCode ?? "unknown"}</div>
            )}
          </div>
        ))}
        {error && <div className="terminal-error">{error}</div>}
      </div>
      <form
        className="terminal-input-row"
        onSubmit={(event) => {
          event.preventDefault();
          void runCommand();
        }}
      >
        <span>$</span>
        <input
          ref={inputRef}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={cwd ? "Enter a local command..." : "Open a folder first"}
          disabled={running || !cwd}
          autoComplete="off"
        />
        <button type="submit" disabled={running || !command.trim() || !cwd}>
          {running ? "Running..." : "Run"}
        </button>
      </form>
    </section>
  );
}
