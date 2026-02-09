import { useState } from "react";

export default function CommitDialog({ gitStatus, onCommit, onClose }) {
  const [message, setMessage] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const branch = gitStatus?.branch || "unknown";
  const fileCount =
    (gitStatus?.staged?.length || 0) + (gitStatus?.unstaged?.length || 0);
  const additions =
    (gitStatus?.stagedAdditions || 0) + (gitStatus?.unstagedAdditions || 0);
  const deletions =
    (gitStatus?.stagedDeletions || 0) + (gitStatus?.unstagedDeletions || 0);

  async function handleCommit(push) {
    setError("");
    setSubmitting(true);
    try {
      await onCommit({
        message: message.trim(),
        includeUnstaged,
        push,
      });
      setSubmitting(false);
      onClose();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog commit-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Commit your changes</h2>
          <button className="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="dialog-body">
          <div className="commit-row">
            <span className="commit-label">Branch</span>
            <span className="commit-value">{branch}</span>
          </div>
          <div className="commit-row">
            <span className="commit-label">Changes</span>
            <span className="commit-value">
              {fileCount} files
              <span className="commit-counts">
                <span className="git-add">+{additions}</span>
                <span className="git-del">-{deletions}</span>
              </span>
            </span>
          </div>
          <label className="commit-toggle">
            <input
              type="checkbox"
              checked={includeUnstaged}
              onChange={(e) => setIncludeUnstaged(e.target.checked)}
            />
            <span>Include unstaged changes</span>
          </label>
          <div className="setting-group">
            <label>Commit message</label>
            <textarea
              className="commit-message"
              rows="3"
              placeholder="Describe your changes"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {error && <div className="git-error">{error}</div>}
          <div className="commit-actions">
            <button
              className="btn-secondary"
              onClick={() => handleCommit(false)}
              disabled={submitting}
            >
              {submitting ? "Committing..." : "Commit"}
            </button>
            <button
              className="btn-primary"
              onClick={() => handleCommit(true)}
              disabled={submitting}
            >
              {submitting ? "Committing..." : "Commit and push"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
