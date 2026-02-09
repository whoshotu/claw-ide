export default function StatusBar({ opencodeAvailable, activeProject }) {
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-item">
          <span className={`status-dot ${opencodeAvailable ? "green" : "red"}`}></span>
          {opencodeAvailable ? "opencode" : "opencode not found"}
        </span>
        {activeProject && (
          <span className="status-item">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l2-1.5h2.5l1 .75h2.5v5.25H2V4z" stroke="currentColor" strokeWidth="0.9" fill="none" />
            </svg>
            {activeProject.name}
          </span>
        )}
      </div>
      <div className="status-right">
        <span className="status-item">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v4l2.5 1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
          </svg>
          Local
        </span>
      </div>
    </div>
  );
}
