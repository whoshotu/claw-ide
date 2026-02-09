import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

function statusLabel(status) {
  switch (status) {
    case "added": return "Added";
    case "modified": return "Modified";
    case "deleted": return "Deleted";
    case "renamed": return "Renamed";
    case "copied": return "Copied";
    case "conflict": return "Conflict";
    case "untracked": return "Untracked";
    default: return "Changed";
  }
}

function statusClass(status) {
  switch (status) {
    case "added": return "added";
    case "modified": return "modified";
    case "deleted": return "deleted";
    case "renamed": return "renamed";
    case "copied": return "copied";
    case "conflict": return "conflict";
    case "untracked": return "untracked";
    default: return "changed";
  }
}

function classForLine(line) {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "";
}

function SelfLoadingDiff({ repoPath, filePath, fileStatus, staged }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const isNew = fileStatus === "untracked";
        const diff = await invoke("git_diff", {
          repoPath,
          filePath,
          staged: !!staged,
          isNew,
        });
        if (!cancelled) setText(diff || "");
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [repoPath, filePath, fileStatus, staged]);

  const lines = useMemo(() => (text || "").split("\n"), [text]);

  return (
    <div className="file-diff-expand">
      <div className="file-diff-content">
        {loading && <div className="diff-loading">Loading diff...</div>}
        {error && <div className="git-error">{error}</div>}
        {!loading && !error && (
          <div className="diff-view">
            {lines.map((line, idx) => (
              <div key={idx} className={`diff-line ${classForLine(line)}`}>
                <span className="diff-line-num">{idx + 1}</span>
                <span className="diff-line-content">{line || "\u00a0"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GitChangesPanel({
  gitStatus,
  gitLoading,
  gitError,
  onRefresh,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
  onSelectFile,
  diffFile,
  diffText,
  diffLoading,
  diffError,
  diffMode,
  diffHasStaged,
  diffHasUnstaged,
  onDiffModeChange,
  onCloseDiff,
  repoPath,
}) {
  const [viewAll, setViewAll] = useState(false);

  if (!gitStatus || !gitStatus.isRepo) {
    return (
      <div className="git-panel">
        <div className="git-header">
          <span>Changes</span>
        </div>
        <div className="git-empty">No git repository detected.</div>
      </div>
    );
  }

  const staged = gitStatus.staged || [];
  const unstaged = gitStatus.unstaged || [];
  const totalAdditions =
    (gitStatus.stagedAdditions || 0) + (gitStatus.unstagedAdditions || 0);
  const totalDeletions =
    (gitStatus.stagedDeletions || 0) + (gitStatus.unstagedDeletions || 0);
  const hasChanges = staged.length > 0 || unstaged.length > 0;

  function handleFileClick(filePath) {
    if (viewAll) return;
    if (diffFile === filePath) {
      onCloseDiff?.();
    } else {
      onSelectFile?.(filePath);
    }
  }

  function handleViewAllToggle() {
    if (viewAll) {
      onCloseDiff?.();
    }
    setViewAll((v) => !v);
  }

  function renderFileRow(file, section) {
    const isStaged = section === "staged";
    const isExpanded = viewAll || diffFile === file.path;

    return (
      <div key={`${section}-${file.path}-${file.status}`}>
        <div
          className={`git-file ${isExpanded ? "selected" : ""}`}
          onClick={() => handleFileClick(file.path)}
          role="button"
          tabIndex={0}
        >
          <span className={`git-status ${statusClass(file.status)}`}>
            {statusLabel(file.status)}
          </span>
          <span className="git-path" title={file.path}>
            {file.path}
          </span>
          <div className="git-file-actions">
            {!isStaged && (
              <button
                className="git-icon-btn discard"
                onClick={(e) => { e.stopPropagation(); onDiscardFile?.(file.path, file.status); }}
                title="Discard changes"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 2v2H2v1h1v8.5a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5V5h1V4h-2V2H4zm1 2V3h6v1H5zm-1 2h8v8H4V6z" fill="currentColor"/>
                </svg>
              </button>
            )}
            <button
              className={`git-icon-btn ${isStaged ? "unstage" : "stage"}`}
              onClick={(e) => { e.stopPropagation(); isStaged ? onUnstageFile(file.path) : onStageFile(file.path); }}
              title={isStaged ? "Unstage" : "Stage"}
            >
              {isStaged ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>
        </div>
        {isExpanded && viewAll && repoPath && (
          <SelfLoadingDiff
            repoPath={repoPath}
            filePath={file.path}
            fileStatus={file.status}
            staged={isStaged}
          />
        )}
        {isExpanded && !viewAll && diffFile === file.path && (
          <FileDiffFromProps
            diffText={diffText}
            diffLoading={diffLoading}
            diffError={diffError}
            diffMode={diffMode}
            diffHasStaged={diffHasStaged}
            diffHasUnstaged={diffHasUnstaged}
            onDiffModeChange={onDiffModeChange}
          />
        )}
      </div>
    );
  }

  return (
    <div className="git-panel">
      <div className="git-header">
        <span>Changes</span>
        <div className="git-header-actions">
          <span className="git-counts">
            <span className="git-add">+{totalAdditions}</span>
            <span className="git-del">-{totalDeletions}</span>
          </span>
          {hasChanges && (
            <button
              className={`git-view-all ${viewAll ? "active" : ""}`}
              onClick={handleViewAllToggle}
              title={viewAll ? "Collapse all diffs" : "Expand all diffs"}
            >
              {viewAll ? "Collapse" : "View all"}
            </button>
          )}
          <button className="git-refresh" onClick={onRefresh} title="Refresh">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M11 4.5A4.5 4.5 0 1 0 12 7" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
              <path d="M11 2v2.5H8.5" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      {gitLoading && <div className="git-loading">Loading git status...</div>}
      {gitError && <div className="git-error">{gitError}</div>}
      {!gitLoading && !gitError && !hasChanges && (
        <div className="git-empty">Working tree clean.</div>
      )}
      {!gitLoading && !gitError && staged.length > 0 && (
        <div className="git-section">
          <div className="git-section-header">
            <span>Staged · {staged.length}</span>
            <button className="git-section-action" onClick={onUnstageAll}>
              Unstage all
            </button>
          </div>
          <div className="git-files">
            {staged.map((file) => renderFileRow(file, "staged"))}
          </div>
        </div>
      )}
      {!gitLoading && !gitError && unstaged.length > 0 && (
        <div className="git-section">
          <div className="git-section-header">
            <span>Unstaged · {unstaged.length}</span>
            <button className="git-section-action" onClick={onStageAll}>
              Stage all
            </button>
          </div>
          <div className="git-files">
            {unstaged.map((file) => renderFileRow(file, "unstaged"))}
          </div>
        </div>
      )}
    </div>
  );
}

function FileDiffFromProps({ diffText, diffLoading, diffError, diffMode, diffHasStaged, diffHasUnstaged, onDiffModeChange }) {
  const lines = useMemo(() => (diffText || "").split("\n"), [diffText]);

  return (
    <div className="file-diff-expand">
      {(diffHasStaged && diffHasUnstaged) && (
        <div className="inline-diff-tabs">
          <button
            className={`inline-diff-tab ${diffMode === "unstaged" ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); onDiffModeChange("unstaged"); }}
          >
            Unstaged
          </button>
          <button
            className={`inline-diff-tab ${diffMode === "staged" ? "active" : ""}`}
            onClick={(e) => { e.stopPropagation(); onDiffModeChange("staged"); }}
          >
            Staged
          </button>
        </div>
      )}
      <div className="file-diff-content">
        {diffLoading && <div className="diff-loading">Loading diff...</div>}
        {diffError && <div className="git-error">{diffError}</div>}
        {!diffLoading && !diffError && (
          <div className="diff-view">
            {lines.map((line, idx) => (
              <div key={idx} className={`diff-line ${classForLine(line)}`}>
                <span className="diff-line-num">{idx + 1}</span>
                <span className="diff-line-content">{line || "\u00a0"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
