export default function WelcomeScreen({ activeProject, onSelectProject }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-center">
        <div className="welcome-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="url(#grad)" strokeWidth="2" strokeDasharray="6 4">
              <animateTransform attributeName="transform" type="rotate" dur="8s" from="0 24 24" to="360 24 24" repeatCount="indefinite" />
            </circle>
            <circle cx="24" cy="24" r="12" stroke="url(#grad)" strokeWidth="1.5" strokeDasharray="4 3">
              <animateTransform attributeName="transform" type="rotate" dur="6s" from="360 24 24" to="0 24 24" repeatCount="indefinite" />
            </circle>
            <circle cx="24" cy="24" r="4" fill="#fff" opacity="0.8" />
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="48" y2="48">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 className="welcome-title">Let's build</h1>
        {activeProject ? (
          <div className="welcome-project-info">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4l2-2h3l1 1h4v8H2V4z" stroke="currentColor" strokeWidth="1.1" fill="none" />
            </svg>
            <span>{activeProject.name}</span>
            <span className="welcome-project-path">{activeProject.directory}</span>
          </div>
        ) : (
          <button className="project-btn" onClick={onSelectProject}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4.5l2-2h3l1 1h4v8H2V4.5z" stroke="currentColor" strokeWidth="1.1" />
            </svg>
            <span>Select project folder...</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
