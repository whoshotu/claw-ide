import { useState } from "react";

const MEMORY_TYPES = [
  { id: "constraint", label: "Constraint", description: "Rules that MUST be followed" },
  { id: "convention", label: "Convention", description: "Style & architecture patterns" },
  { id: "decision", label: "Decision", description: "Architectural decisions & rationale" },
  { id: "preference", label: "Preference", description: "User/team expectations" },
  { id: "mistake", label: "Mistake", description: "Past bugs, gotchas, lessons learned" },
  { id: "procedure", label: "Procedure", description: "How work gets done" },
];

const PRIORITIES = [
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

const STATUS_LABELS = {
  proposed: "Proposed",
  approved: "Approved",
  deprecated: "Deprecated",
};

const TYPE_FILTERS = [
  { id: "all", label: "All" },
  ...MEMORY_TYPES.map((t) => ({ id: t.id, label: t.label })),
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

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

const EMPTY_FORM = {
  memoryType: "preference",
  title: "",
  content: "",
  tags: "",
  priority: "medium",
  status: "approved",
  symptoms: "",
  rootCause: "",
  fixPattern: "",
  filesInvolved: "",
  preventionChecklist: "",
};

export default function MemoryPanel({ memories, onSave, onDelete, onUpdateStatus, onClose, projectName }) {
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [search, setSearch] = useState("");

  const filtered = memories.filter((m) => {
    if (filter !== "all" && m.memoryType !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (m.title || "").toLowerCase().includes(q) ||
        (m.content || "").toLowerCase().includes(q) ||
        (m.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Sort: proposed first (needs attention), then approved, then deprecated
  const statusOrder = { proposed: 0, approved: 1, deprecated: 2 };
  const sorted = [...filtered].sort((a, b) => {
    const sa = statusOrder[a.status] ?? 1;
    const sb = statusOrder[b.status] ?? 1;
    if (sa !== sb) return sa - sb;
    return b.updatedAt - a.updatedAt;
  });

  function openAddForm() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(item) {
    setForm({
      memoryType: item.memoryType || "preference",
      title: item.title || "",
      content: item.content || "",
      tags: (item.tags || []).join(", "),
      priority: item.priority || "medium",
      status: item.status || "approved",
      symptoms: item.symptoms || "",
      rootCause: item.rootCause || "",
      fixPattern: item.fixPattern || "",
      filesInvolved: (item.filesInvolved || []).join(", "),
      preventionChecklist: (item.preventionChecklist || []).join("\n"),
    });
    setEditingId(item.id);
    setShowForm(true);
  }

  function handleSubmit() {
    if (!form.title.trim() && !form.content.trim()) return;
    const item = {
      id: editingId || generateId(),
      projectId: "",
      memoryType: form.memoryType,
      title: form.title.trim() || form.content.trim().slice(0, 80),
      content: form.content.trim() || form.title.trim(),
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      status: form.status,
      priority: form.priority,
      createdAt: editingId
        ? (memories.find((m) => m.id === editingId)?.createdAt || Date.now())
        : Date.now(),
      updatedAt: Date.now(),
      source: "user",
      sourceRef: "",
      symptoms: form.symptoms.trim(),
      rootCause: form.rootCause.trim(),
      fixPattern: form.fixPattern.trim(),
      filesInvolved: form.filesInvolved
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean),
      preventionChecklist: form.preventionChecklist
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    };
    onSave(item);
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  const proposedCount = memories.filter((m) => m.status === "proposed").length;
  const approvedCount = memories.filter((m) => m.status === "approved").length;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog memory-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>
            Project Memory
            {projectName && <span className="memory-project-name"> — {projectName}</span>}
          </h2>
          <div className="memory-header-stats">
            <span className="memory-stat approved">{approvedCount} active</span>
            {proposedCount > 0 && (
              <span className="memory-stat proposed">{proposedCount} pending</span>
            )}
          </div>
          <button className="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="dialog-body memory-body">
          {/* Search & Add */}
          <div className="memory-toolbar">
            <input
              type="text"
              className="memory-search"
              placeholder="Search memories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn-primary memory-add-btn" onClick={openAddForm}>
              + Add
            </button>
          </div>

          {/* Type filter tabs */}
          <div className="memory-filters">
            {TYPE_FILTERS.map((f) => {
              const count =
                f.id === "all"
                  ? memories.length
                  : memories.filter((m) => m.memoryType === f.id).length;
              return (
                <button
                  key={f.id}
                  className={`memory-filter-btn ${filter === f.id ? "active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {count > 0 && <span className="memory-filter-count">{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Add/Edit Form */}
          {showForm && (
            <div className="memory-form">
              <div className="memory-form-header">
                {editingId ? "Edit Memory" : "Add Memory"}
              </div>
              <div className="memory-form-row">
                <div className="setting-group">
                  <label>Type</label>
                  <select
                    value={form.memoryType}
                    onChange={(e) => setForm((f) => ({ ...f, memoryType: e.target.value }))}
                  >
                    {MEMORY_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} — {t.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="setting-group memory-form-half">
                  <label>Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="setting-group memory-form-half">
                  <label>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="approved">Approved</option>
                    <option value="proposed">Proposed</option>
                    <option value="deprecated">Deprecated</option>
                  </select>
                </div>
              </div>
              <div className="setting-group">
                <label>Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Short description (e.g., Use pnpm, not npm)"
                />
              </div>
              <div className="setting-group">
                <label>Content / Details</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Full explanation, rationale, or details..."
                  rows={3}
                />
              </div>
              <div className="setting-group">
                <label>Tags (comma-separated)</label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="e.g., auth, db, ci, frontend"
                />
              </div>

              {/* Mistake-specific fields */}
              {form.memoryType === "mistake" && (
                <>
                  <div className="setting-group">
                    <label>Symptoms (error messages, failing tests)</label>
                    <input
                      type="text"
                      value={form.symptoms}
                      onChange={(e) => setForm((f) => ({ ...f, symptoms: e.target.value }))}
                      placeholder="e.g., TypeError: Cannot read property of undefined"
                    />
                  </div>
                  <div className="setting-group">
                    <label>Root Cause</label>
                    <input
                      type="text"
                      value={form.rootCause}
                      onChange={(e) => setForm((f) => ({ ...f, rootCause: e.target.value }))}
                      placeholder="e.g., Timezone offset not handled in date parsing"
                    />
                  </div>
                  <div className="setting-group">
                    <label>Fix Pattern</label>
                    <input
                      type="text"
                      value={form.fixPattern}
                      onChange={(e) => setForm((f) => ({ ...f, fixPattern: e.target.value }))}
                      placeholder="e.g., Use date-fns-tz instead of new Date(string)"
                    />
                  </div>
                  <div className="setting-group">
                    <label>Files Involved (comma-separated)</label>
                    <input
                      type="text"
                      value={form.filesInvolved}
                      onChange={(e) => setForm((f) => ({ ...f, filesInvolved: e.target.value }))}
                      placeholder="e.g., src/utils/date.ts, src/api/orders.ts"
                    />
                  </div>
                  <div className="setting-group">
                    <label>Prevention Checklist (one per line)</label>
                    <textarea
                      value={form.preventionChecklist}
                      onChange={(e) => setForm((f) => ({ ...f, preventionChecklist: e.target.value }))}
                      placeholder={"Check timezone handling in date code\nAdd regression test"}
                      rows={3}
                    />
                  </div>
                </>
              )}

              <div className="memory-form-actions">
                <button className="btn-primary" onClick={handleSubmit}>
                  {editingId ? "Update" : "Save"}
                </button>
                <button className="btn-secondary" onClick={cancelForm}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Memory items list */}
          <div className="memory-list">
            {sorted.length === 0 && (
              <div className="memory-empty">
                {memories.length === 0
                  ? "No memories yet. Add one with the + Add button or use /remember in chat."
                  : "No memories match the current filter."}
              </div>
            )}
            {sorted.map((item) => (
              <div
                key={item.id}
                className={`memory-item memory-status-${item.status}`}
              >
                <div className="memory-item-header">
                  <span className={`memory-type-tag type-${item.memoryType}`}>
                    {item.memoryType}
                  </span>
                  <span className={`memory-status-badge status-${item.status}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <span className={`memory-priority priority-${item.priority}`}>
                    {item.priority}
                  </span>
                  <span className="memory-item-time">{timeAgo(item.updatedAt)}</span>
                </div>
                <div className="memory-item-title">{item.title}</div>
                {item.content && item.content !== item.title && (
                  <div className="memory-item-content">{item.content}</div>
                )}
                {item.tags && item.tags.length > 0 && (
                  <div className="memory-item-tags">
                    {item.tags.map((tag) => (
                      <span key={tag} className="memory-tag">{tag}</span>
                    ))}
                  </div>
                )}
                {item.memoryType === "mistake" && (
                  <div className="memory-mistake-details">
                    {item.symptoms && <div><strong>Symptoms:</strong> {item.symptoms}</div>}
                    {item.rootCause && <div><strong>Root cause:</strong> {item.rootCause}</div>}
                    {item.fixPattern && <div><strong>Fix:</strong> {item.fixPattern}</div>}
                    {item.filesInvolved && item.filesInvolved.length > 0 && (
                      <div><strong>Files:</strong> {item.filesInvolved.join(", ")}</div>
                    )}
                    {item.preventionChecklist && item.preventionChecklist.length > 0 && (
                      <div>
                        <strong>Prevention:</strong>
                        <ul className="memory-checklist">
                          {item.preventionChecklist.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {item.source && (
                  <div className="memory-item-source">
                    Source: {item.source}
                    {item.sourceRef && ` (${item.sourceRef})`}
                  </div>
                )}
                <div className="memory-item-actions">
                  {item.status === "proposed" && (
                    <button
                      className="btn-approve"
                      onClick={() => onUpdateStatus(item.id, "approved")}
                    >
                      Approve
                    </button>
                  )}
                  {item.status === "approved" && (
                    <button
                      className="btn-deprecate"
                      onClick={() => onUpdateStatus(item.id, "deprecated")}
                    >
                      Deprecate
                    </button>
                  )}
                  {item.status === "deprecated" && (
                    <button
                      className="btn-approve"
                      onClick={() => onUpdateStatus(item.id, "approved")}
                    >
                      Re-activate
                    </button>
                  )}
                  <button
                    className="btn-secondary"
                    onClick={() => openEditForm(item)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => onDelete(item.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
