import { useState } from "react";

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Sidebar({
  projects,
  activeProjectId,
  threads,
  activeThreadId,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onNewThread,
  onSelectThread,
  onDeleteThread,
  onOpenSettings,
  style,
}) {
  const [expandedProjects, setExpandedProjects] = useState({});

  function toggleProject(projectId) {
    if (activeProjectId === projectId) {
      setExpandedProjects((prev) => ({
        ...prev,
        [projectId]: !prev[projectId],
      }));
    } else {
      onSelectProject(projectId);
      setExpandedProjects((prev) => ({
        ...prev,
        [projectId]: true,
      }));
    }
  }

  const isExpanded = (id) =>
    expandedProjects[id] !== undefined ? expandedProjects[id] : id === activeProjectId;

  return (
    <aside className="sidebar" style={style}>
      <div className="sidebar-top">
        <button className="sidebar-btn primary" onClick={onNewProject}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 5.5l2.5-2.5h3l1 1h4.5v9H2V5.5z" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          New project
        </button>
        {activeProjectId && (
          <button className="sidebar-btn" onClick={onNewThread}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            New thread
          </button>
        )}
      </div>

      <div className="sidebar-projects">
        <div className="section-header">
          <span className="section-label">Projects</span>
        </div>
        <div className="projects-list">
          {projects.map((project) => (
            <div key={project.id} className="project-group">
              <div
                className={`project-item ${activeProjectId === project.id ? "active" : ""}`}
                onClick={() => toggleProject(project.id)}
              >
                <div className="project-item-row">
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className={`expand-icon ${isExpanded(project.id) ? "expanded" : ""}`}
                  >
                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="folder-icon">
                    <path d="M2 4l2-2h3l1 1h4v8H2V4z" stroke="currentColor" strokeWidth="1.1" fill="none" />
                  </svg>
                  <span className="project-name">{project.name}</span>
                  <button
                    className="item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject(project.id);
                    }}
                    title="Remove project"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {isExpanded(project.id) && activeProjectId === project.id && (
                <div className="project-threads">
                  {threads.map((thread) => (
                    <div
                      key={thread.id}
                      className={`thread-item ${activeThreadId === thread.id ? "active" : ""}`}
                      onClick={() => onSelectThread(thread.id)}
                    >
                      <div className="thread-item-row">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="thread-icon">
                          <path d="M3 3h6M3 6h4M3 9h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                        </svg>
                        <span className="thread-title">{thread.title}</span>
                        <button
                          className="item-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteThread(thread.id);
                          }}
                          title="Delete thread"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                      <span className="thread-meta">{timeAgo(thread.updatedAt)}</span>
                    </div>
                  ))}
                  {threads.length === 0 && (
                    <div className="threads-empty">No threads yet</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {projects.length === 0 && (
            <div className="threads-empty">
              No projects yet. Click "New project" to add a folder.
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-bottom">
        <button className="sidebar-btn" onClick={onOpenSettings}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Settings
        </button>
      </div>
    </aside>
  );
}
