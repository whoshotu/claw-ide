import { useState } from "react";

export default function CommitDialog({ gitStatus, onCommit, onClose, onGenerateMessage }) {
  const [message, setMessage] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
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

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    try {
      const msg = await onGenerateMessage(includeUnstaged);
      if (msg) setMessage(msg);
    } catch (e) {
      setError(String(e));
    }
    setGenerating(false);
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
            <div className="commit-message-header">
              <label>Commit message</label>
              <button
                className="btn-generate"
                onClick={handleGenerate}
                disabled={generating || submitting || fileCount === 0}
                title="Generate commit message from diff using AI"
              >
                {generating ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 12 12" className="spinner-icon">
                      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="16 10" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.5 2.5l1.4 1.4M8.1 8.1l1.4 1.4M9.5 2.5L8.1 3.9M3.9 8.1L2.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    Generate
                  </>
                )}
              </button>
            </div>
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
              disabled={submitting || generating}
            >
              {submitting ? "Committing..." : "Commit"}
            </button>
            <button
              className="btn-primary"
              onClick={() => handleCommit(true)}
              disabled={submitting || generating}
            >
              {submitting ? "Committing..." : "Commit and push"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
