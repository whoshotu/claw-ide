export default function Topbar({
  onNewThread,
  activeProject,
  hasProject,
  onToggleSidebar,
  isSidebarOpen,
  onToggleDirectory,
  onToggleTerminal,
  isDirectoryOpen,
  isTerminalOpen,
  gitSummary,
  onOpenCommit,
}) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <button
          className={`topbar-icon-btn ${isSidebarOpen ? "active" : ""}`}
          onClick={onToggleSidebar}
          title={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={isSidebarOpen}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" fill="none" />
            <line x1="5" y1="2" x2="5" y2="12" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
        <button
          className={`topbar-icon-btn ${isDirectoryOpen ? "active" : ""}`}
          onClick={onToggleDirectory}
          title={isDirectoryOpen ? "Hide directory" : "Show directory"}
          aria-pressed={isDirectoryOpen}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 4l2-2h3l1 1h4v8H2V4z" stroke="currentColor" strokeWidth="1.1" fill="none" />
          </svg>
        </button>
        <button
          className={`topbar-icon-btn ${isTerminalOpen ? "active" : ""}`}
          onClick={onToggleTerminal}
          title={isTerminalOpen ? "Hide terminal" : "Show terminal"}
          aria-pressed={isTerminalOpen}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 3.5l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 9.5h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        {hasProject && (
          <button className="topbar-btn" onClick={onNewThread}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            New thread
          </button>
        )}
        {activeProject && (
          <span className="topbar-project-name">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4l2-2h3l1 1h4v8H2V4z" stroke="currentColor" strokeWidth="1.1" fill="none" />
            </svg>
            {activeProject.name}
          </span>
        )}
      </div>
      <div className="topbar-right">
        {gitSummary?.isRepo && (
          <div className="git-summary">
            <button
              className="topbar-btn"
              onClick={onOpenCommit}
              disabled={!gitSummary.hasChanges}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M1.5 7h3M9.5 7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Commit
            </button>
            <span className="git-counts">
              <span className="git-add">+{gitSummary.additions}</span>
              <span className="git-del">-{gitSummary.deletions}</span>
            </span>
          </div>
        )}
        {activeProject && (
          <span className="topbar-path" title={activeProject.directory}>
            {activeProject.directory}
          </span>
        )}
      </div>
    </div>
  );
}
