import { useMemo } from "react";

function classForLine(line) {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "";
}

export default function GitDiffModal({
  filePath,
  mode,
  hasStaged,
  hasUnstaged,
  diffText,
  loading,
  error,
  onModeChange,
  onClose,
}) {
  const lines = useMemo(() => (diffText || "").split("\n"), [diffText]);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog diff-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Changes</h2>
          <button className="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="dialog-body">
          <div className="diff-header">
            <span className="diff-path" title={filePath}>{filePath}</span>
            <div className="diff-tabs">
              {hasUnstaged && (
                <button
                  className={`diff-tab ${mode === "unstaged" ? "active" : ""}`}
                  onClick={() => onModeChange("unstaged")}
                >
                  Unstaged
                </button>
              )}
              {hasStaged && (
                <button
                  className={`diff-tab ${mode === "staged" ? "active" : ""}`}
                  onClick={() => onModeChange("staged")}
                >
                  Staged
                </button>
              )}
            </div>
          </div>
          {loading && <div className="diff-loading">Loading diff...</div>}
          {error && <div className="git-error">{error}</div>}
          {!loading && !error && (
            <div className="diff-view">
              {lines.map((line, idx) => (
                <div key={idx} className={`diff-line ${classForLine(line)}`}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
