import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from "../store/appStore";

interface RunPanelProps {
  tauriApi: any;
}

interface TaskResult {
  command: string;
  output: string;
  exitCode: number | null;
}

const tasks = [
  { id: "typecheck", label: "Typecheck frontend", command: "npm run build" },
  { id: "rust-check", label: "Typecheck Rust backend", command: "cargo check --manifest-path src-tauri/Cargo.toml" },
  { id: "tests", label: "Run tests", command: "npm test -- --run" },
];

export function RunPanel({ tauriApi }: RunPanelProps) {
  const { currentDirectory, activeFilePath } = useAppStore();
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<TaskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processId, setProcessId] = useState<number | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<{ pid: number; output: string; done: boolean; exit_code: number | null }>("process-output", (event) => {
      if (event.payload.pid !== processId) return;
      if (event.payload.output) {
        setResult((current) => current ? { ...current, output: `${current.output}${current.output ? "\n" : ""}${event.payload.output}` } : current);
      }
      if (event.payload.done) {
        setResult((current) => current ? { ...current, exitCode: event.payload.exit_code } : current);
        setRunning(null);
        setProcessId(null);
      }
    }).then((cleanup) => { unlisten = cleanup; });
    return () => { unlisten?.(); };
  }, [processId]);

  const execute = async (id: string, command: string) => {
    if (!currentDirectory || !tauriApi?.invoke || running) return;
    setRunning(id);
    setError(null);
    try {
      const pid = await tauriApi.invoke("start_terminal_process", { command, cwd: currentDirectory });
      setProcessId(pid);
      setResult({ command, output: "", exitCode: null });
    } catch (cause) {
      setError(String(cause));
    }
  };

  const stop = async () => {
    if (processId === null) return;
    await tauriApi.invoke("stop_terminal_process", { pid: processId });
  };

  const debugCommand = activeFilePath?.endsWith(".py")
    ? `python -m pdb "${activeFilePath}"`
    : activeFilePath?.match(/\.(js|jsx|mjs|cjs)$/)
      ? `node --inspect "${activeFilePath}"`
      : "Select a Python or JavaScript file to use the basic debug launcher.";

  return (
    <div className="run-panel">
      <div className="run-section">
        <h3>Checks and tests</h3>
        {tasks.map((task) => (
          <button key={task.id} onClick={() => void execute(task.id, task.command)} disabled={!currentDirectory || Boolean(running)}>
            <span>{running === task.id ? "Running..." : task.label}</span>
            <code>{task.command}</code>
          </button>
        ))}
      </div>
      <div className="run-section">
        <h3>Debug current file</h3>
        <p>Launches the selected script with its language debugger or inspector.</p>
        <button
          onClick={() => void execute("debug", debugCommand)}
          disabled={!currentDirectory || Boolean(running) || debugCommand.startsWith("Select")}
        >
          {running === "debug" ? "Starting..." : "Start Debug Session"}
        </button>
        <code className="run-command">{debugCommand}</code>
        {processId !== null && <button onClick={() => void stop()}>Stop process ({processId})</button>}
      </div>
      {result && (
        <div className={result.exitCode === 0 ? "run-result success" : "run-result failure"}>
          <code>$ {result.command}</code>
          <pre>{result.output || "Process started..."}</pre>
          <strong>Exit code: {result.exitCode ?? "unknown"}</strong>
        </div>
      )}
      {error && <div className="terminal-error">{error}</div>}
    </div>
  );
}
