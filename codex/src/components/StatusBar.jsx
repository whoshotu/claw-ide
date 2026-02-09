import { useState, useRef, useEffect, useCallback } from "react";

export default function StatusBar({
  opencodeAvailable,
  activeProject,
  gitStatus,
  onListBranches,
  onCreateBranch,
  onSwitchBranch,
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [branches, setBranches] = useState([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);

  const currentBranch = gitStatus?.branch || "";
  const isRepo = gitStatus?.isRepo;

  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
    setInput("");
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [closeDropdown]);

  async function openDropdown() {
    setError("");
    setLoading(true);
    setShowDropdown(true);
    try {
      const result = await onListBranches();
      setBranches(result.branches || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function handleSwitch(name) {
    if (name === currentBranch) { closeDropdown(); return; }
    setError("");
    setLoading(true);
    try {
      await onSwitchBranch(name);
      closeDropdown();
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }

  async function handleCreate(name) {
    if (!name) return;
    setError("");
    setLoading(true);
    try {
      await onCreateBranch(name);
      closeDropdown();
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }

  const trimmed = input.trim();
  const filtered = branches.filter((b) =>
    b.toLowerCase().includes(input.toLowerCase())
  );
  const exactMatch = branches.some((b) => b === trimmed);
  const showCreate = trimmed.length > 0 && !exactMatch;

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-item">
          <span className={`status-dot ${opencodeAvailable ? "green" : "red"}`}></span>
          {opencodeAvailable ? "opencode" : "opencode not found"}
        </span>
        {isRepo && (
          <div className="branch-selector" ref={ref}>
            <button
              className="status-branch-btn"
              onClick={() => showDropdown ? closeDropdown() : openDropdown()}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <circle cx="5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <circle cx="11" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <path d="M5 5.5v5M5 8h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span>{currentBranch}</span>
            </button>
            {showDropdown && (
              <div className="branch-dropdown">
                <div className="branch-dropdown-search">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Switch or create branch..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") closeDropdown();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (showCreate) {
                          handleCreate(trimmed);
                        } else if (filtered.length === 1) {
                          handleSwitch(filtered[0]);
                        }
                      }
                    }}
                  />
                </div>
                {error && (
                  <div className="branch-dropdown-error">{error}</div>
                )}
                <div className="branch-dropdown-list">
                  {showCreate && (
                    <div
                      className="branch-dropdown-item create"
                      onClick={() => handleCreate(trimmed)}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      Create branch &lsquo;{trimmed}&rsquo;
                    </div>
                  )}
                  {showCreate && filtered.length > 0 && (
                    <div className="branch-dropdown-sep"></div>
                  )}
                  {loading && branches.length === 0 ? (
                    <div className="branch-dropdown-item disabled">Loading...</div>
                  ) : (
                    filtered.map((b) => (
                      <div
                        key={b}
                        className={`branch-dropdown-item ${b === currentBranch ? "current" : ""}`}
                        onClick={() => handleSwitch(b)}
                      >
                        {b === currentBranch && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {b}
                      </div>
                    ))
                  )}
                  {filtered.length === 0 && !loading && !showCreate && (
                    <div className="branch-dropdown-item disabled">No branches</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
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
