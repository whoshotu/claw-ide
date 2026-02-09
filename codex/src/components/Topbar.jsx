export default function Topbar({ onNewThread, activeProject, hasProject }) {
  return (
    <div className="topbar">
      <div className="topbar-left">
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
        {activeProject && (
          <span className="topbar-path" title={activeProject.directory}>
            {activeProject.directory}
          </span>
        )}
      </div>
    </div>
  );
}
