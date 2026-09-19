import { ReactNode } from "react";
import { WorkbenchView } from "../store/appStore";

interface ActivityBarProps {
  activeView: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
  onTerminal: () => void;
}

import { Files, GitBranch, Play, Puzzle, Search } from "lucide-react";

const items: Array<{ view: WorkbenchView; label: string; icon: ReactNode }> = [
  { view: "explorer", label: "Explorer", icon: <Files size={21} /> },
  { view: "search", label: "Search", icon: <Search size={21} /> },
  { view: "source-control", label: "Source Control", icon: <GitBranch size={21} /> },
  { view: "run", label: "Run and Tasks", icon: <Play size={21} /> },
  { view: "extensions", label: "Extensions", icon: <Puzzle size={21} /> },
];

export function ActivityBar({ activeView, onViewChange, onTerminal }: ActivityBarProps) {
  return (
    <nav className="activity-bar" aria-label="Workbench views">
      {items.map((item) => (
        <button
          key={item.view}
          className={activeView === item.view ? "activity-button active" : "activity-button"}
          title={item.label}
          aria-label={item.label}
          onClick={() => onViewChange(item.view)}
        >
          <span>{item.icon}</span>
        </button>
      ))}
      <button className="activity-button terminal-button" title="Terminal" aria-label="Terminal" onClick={onTerminal}>
        <span>▰</span>
      </button>
    </nav>
  );
}
