import { useEffect, useRef, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { watch } from "@tauri-apps/plugin-fs";
import GitChangesPanel from "./GitChangesPanel";

const AUTO_REFRESH_MS = 10000;
const WATCH_DEBOUNCE_MS = 500;

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function classForLine(line) {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "";
}

function InlineDiff({
  filePath,
  diffText,
  diffLoading,
  diffError,
  diffMode,
  hasStaged,
  hasUnstaged,
  onModeChange,
  onClose,
  onStageFile,
  onUnstageFile,
}) {
  const lines = useMemo(() => (diffText || "").split("\n"), [diffText]);
  const fileName = filePath ? filePath.split("/").pop() : "";
  const additions = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const deletions = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;

  return (
    <div className="inline-diff">
      <div className="inline-diff-header">
        <button className="inline-diff-back" onClick={onClose} title="Back to changes">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="inline-diff-filename" title={filePath}>{fileName}</span>
        <span className="inline-diff-stats">
          {additions > 0 && <span className="git-add">+{additions}</span>}
          {deletions > 0 && <span className="git-del">-{deletions}</span>}
        </span>
        <div className="inline-diff-actions">
          {diffMode === "unstaged" && (
            <button
              className="inline-diff-action-btn stage"
              onClick={() => onStageFile?.(filePath)}
              title="Stage file"
            >
              +
            </button>
          )}
          {diffMode === "staged" && (
            <button
              className="inline-diff-action-btn unstage"
              onClick={() => onUnstageFile?.(filePath)}
              title="Unstage file"
            >
              −
            </button>
          )}
          <button className="inline-diff-action-btn revert" onClick={onClose} title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      {(hasStaged && hasUnstaged) && (
        <div className="inline-diff-tabs">
          <button
            className={`inline-diff-tab ${diffMode === "unstaged" ? "active" : ""}`}
            onClick={() => onModeChange("unstaged")}
          >
            Unstaged
          </button>
          <button
            className={`inline-diff-tab ${diffMode === "staged" ? "active" : ""}`}
            onClick={() => onModeChange("staged")}
          >
            Staged
          </button>
        </div>
      )}
      <div className="inline-diff-body">
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

export default function DirectoryPanel({
  activeProject,
  gitStatus,
  gitLoading,
  gitError,
  onRefreshGit,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
  // Inline diff props
  diffFile,
  diffText,
  diffLoading,
  diffError,
  diffMode,
  diffHasStaged,
  diffHasUnstaged,
  onSelectFile,
  onDiffModeChange,
  onCloseDiff,
  style,
}) {
  const [rootEntries, setRootEntries] = useState([]);
  const [rootLoading, setRootLoading] = useState(false);
  const [rootError, setRootError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [children, setChildren] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [changesOpen, setChangesOpen] = useState(true);
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const splitRef = useRef(null);
  const expandedRef = useRef(expanded);
  const loadingRef = useRef(loading);
  const refreshTimerRef = useRef(null);
  const unwatchRef = useRef(null);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (!activeProject?.directory) {
      setRootEntries([]);
      setRootError("");
      setExpanded({});
      setChildren({});
      setLoading({});
      setErrors({});
      return;
    }
    loadRoot(activeProject.directory);
  }, [activeProject?.directory]);

  useEffect(() => {
    const container = splitRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const height = container.getBoundingClientRect().height;
      if (height <= 0) return;
      setSplitRatio((prev) => Math.min(0.8, Math.max(0.2, prev)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeProject?.directory) return;
    const interval = setInterval(() => {
      refreshTree(activeProject.directory);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [activeProject?.directory]);

  useEffect(() => {
    if (!activeProject?.directory) return;
    let isActive = true;
    const dirPath = activeProject.directory;

    const startWatch = async () => {
      try {
        const unwatch = await watch(
          dirPath,
          () => {
            if (!isActive) return;
            scheduleRefresh(dirPath);
          },
          { recursive: true, delayMs: WATCH_DEBOUNCE_MS }
        );
        if (!isActive) {
          unwatch();
          return;
        }
        unwatchRef.current = unwatch;
      } catch (e) {
        console.error("Failed to watch directory:", e);
      }
    };

    startWatch();

    return () => {
      isActive = false;
      if (unwatchRef.current) {
        unwatchRef.current();
        unwatchRef.current = null;
      }
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [activeProject?.directory]);

  function scheduleRefresh(dirPath) {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refreshTree(dirPath);
    }, WATCH_DEBOUNCE_MS);
  }

  function refreshTree(dirPath) {
    if (!dirPath) return;
    refreshRoot(dirPath);
    const expandedDirs = Object.keys(expandedRef.current).filter(
      (path) => expandedRef.current[path]
    );
    expandedDirs.forEach((expandedPath) => {
      if (!loadingRef.current[expandedPath]) {
        loadChildren(expandedPath);
      }
    });
  }

  async function loadRoot(dirPath) {
    setRootLoading(true);
    setRootError("");
    try {
      const entries = await invoke("list_files", { dirPath });
      setRootEntries(sortEntries(entries));
      setExpanded({});
      setChildren({});
      setLoading({});
      setErrors({});
    } catch (e) {
      setRootError(String(e));
      setRootEntries([]);
    } finally {
      setRootLoading(false);
    }
  }

  async function refreshRoot(dirPath) {
    try {
      const entries = await invoke("list_files", { dirPath });
      setRootEntries(sortEntries(entries));
      setRootError("");
    } catch (e) {
      setRootError(String(e));
    }
  }

  async function loadChildren(dirPath) {
    setLoading((prev) => ({ ...prev, [dirPath]: true }));
    setErrors((prev) => ({ ...prev, [dirPath]: "" }));
    try {
      const entries = await invoke("list_files", { dirPath });
      setChildren((prev) => ({ ...prev, [dirPath]: sortEntries(entries) }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [dirPath]: String(e) }));
    } finally {
      setLoading((prev) => ({ ...prev, [dirPath]: false }));
    }
  }

  function toggleDir(entry) {
    const path = entry.path;
    const isOpen = !!expanded[path];
    setExpanded((prev) => ({ ...prev, [path]: !isOpen }));
    if (!isOpen && !children[path] && !loading[path]) {
      loadChildren(path);
    }
  }

  function handleSplitPointerDown(event) {
    event.preventDefault();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture?.(pointerId);
    const container = splitRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    function onMove(e) {
      const offset = e.clientY - rect.top;
      const ratio = offset / rect.height;
      const clamped = Math.min(0.8, Math.max(0.2, ratio));
      setSplitRatio(clamped);
    }

    function onUp() {
      target.releasePointerCapture?.(pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function renderEntries(entries, depth = 0) {
    return entries.map((entry) => {
      const isDir = entry.isDirectory;
      const isOpen = !!expanded[entry.path];
      const paddingLeft = 8 + depth * 12;
      return (
        <div key={entry.path}>
          <div
            className={`dir-entry ${isDir ? "dir" : "file"}`}
            style={{ paddingLeft: `${paddingLeft}px` }}
          >
            {isDir ? (
              <button
                className={`dir-entry-toggle ${isOpen ? "expanded" : ""}`}
                onClick={() => toggleDir(entry)}
                title={isOpen ? "Collapse" : "Expand"}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <span className="dir-entry-spacer" />
            )}
            <span className={`dir-entry-icon ${isDir ? "dir" : "file"}`}>
              {isDir ? (
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M2 4l2-2h3l1 1h4v8H2V4z" stroke="currentColor" strokeWidth="1.1" fill="none" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M4 2h4l2 2v8H4V2z" stroke="currentColor" strokeWidth="1.1" fill="none" />
                </svg>
              )}
            </span>
            <span className="dir-entry-name" title={entry.path}>{entry.name}</span>
          </div>
          {isDir && isOpen && (
            <div className="dir-children">
              {loading[entry.path] && <div className="dir-loading">Loading...</div>}
              {errors[entry.path] && <div className="dir-error">{errors[entry.path]}</div>}
              {children[entry.path] && children[entry.path].length > 0 &&
                renderEntries(children[entry.path], depth + 1)}
              {children[entry.path] && children[entry.path].length === 0 && !loading[entry.path] && !errors[entry.path] && (
                <div className="dir-empty" style={{ paddingLeft: `${paddingLeft + 16}px` }}>
                  Empty
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <aside className="directory-panel" style={style}>
      <div className="section-toggle-row">
        <button
          className="section-toggle"
          onClick={() => setDirectoryOpen((v) => !v)}
          title={directoryOpen ? "Collapse directory" : "Expand directory"}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={directoryOpen ? "" : "collapsed"}
          >
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Directory</span>
        </button>
        <button
          className="directory-refresh"
          onClick={() => activeProject?.directory && loadRoot(activeProject.directory)}
          title="Refresh"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M11 4.5A4.5 4.5 0 1 0 12 7" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
            <path d="M11 2v2.5H8.5" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {directoryOpen && activeProject?.directory && (
        <div className="directory-path" title={activeProject.directory}>
          {activeProject.directory}
        </div>
      )}
      <div
        className="directory-split"
        ref={splitRef}
        style={{
          gridTemplateRows:
            !directoryOpen && !changesOpen
              ? "0px auto 0px"
              : !directoryOpen
                ? "0px auto 1fr"
                : !changesOpen
                  ? "1fr auto 0px"
                  : `${splitRatio * 100}% auto 1fr`,
        }}
      >
        <div className={`directory-body ${directoryOpen ? "" : "hidden"}`}>
          {directoryOpen && (
            <>
              {!activeProject && <div className="dir-empty">Open a project to view files.</div>}
              {rootLoading && <div className="dir-loading">Loading...</div>}
              {rootError && <div className="dir-error">{rootError}</div>}
              {!rootLoading && !rootError && activeProject && rootEntries.length === 0 && (
                <div className="dir-empty">Empty folder.</div>
              )}
              {!rootLoading && !rootError && activeProject && rootEntries.length > 0 && renderEntries(rootEntries)}
            </>
          )}
        </div>
        <div className="directory-splitter-row">
          {directoryOpen && changesOpen && (
            <div className="directory-splitter" onPointerDown={handleSplitPointerDown} />
          )}
          <button
            className="section-toggle"
            onClick={() => setChangesOpen((v) => !v)}
            title={changesOpen ? "Collapse changes" : "Expand changes"}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={changesOpen ? "" : "collapsed"}
            >
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Changes</span>
          </button>
        </div>
        <div className={`directory-changes ${changesOpen ? "" : "hidden"}`}>
          {changesOpen && (
            <>
              <GitChangesPanel
                gitStatus={gitStatus}
                gitLoading={gitLoading}
                gitError={gitError}
                onRefresh={onRefreshGit}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onDiscardFile={onDiscardFile}
                onStageAll={onStageAll}
                onUnstageAll={onUnstageAll}
                onSelectFile={onSelectFile}
                diffFile={diffFile}
                diffText={diffText}
                diffLoading={diffLoading}
                diffError={diffError}
                diffMode={diffMode}
                diffHasStaged={diffHasStaged}
                diffHasUnstaged={diffHasUnstaged}
                onDiffModeChange={onDiffModeChange}
                onCloseDiff={onCloseDiff}
                repoPath={activeProject?.directory}
              />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
