import { useEffect, useMemo, useState } from "react";

export interface WorkbenchCommand {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  commands: WorkbenchCommand[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const filtered = useMemo(
    () => commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase())),
    [commands, query],
  );

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const execute = (command: WorkbenchCommand | undefined) => {
    if (!command) return;
    command.run();
    onClose();
  };

  return (
    <div className="command-palette-backdrop" onMouseDown={onClose}>
      <div className="command-palette" onMouseDown={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowDown") setSelected((value) => Math.min(value + 1, filtered.length - 1));
            if (event.key === "ArrowUp") setSelected((value) => Math.max(value - 1, 0));
            if (event.key === "Enter") execute(filtered[selected]);
          }}
          placeholder="Type a command..."
        />
        <div className="command-list">
          {filtered.map((command, index) => (
            <button
              key={command.id}
              className={index === selected ? "command-item selected" : "command-item"}
              onClick={() => execute(command)}
            >
              <span>{command.label}</span>
              {command.shortcut && <span className="command-shortcut">{command.shortcut}</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="command-empty">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}
