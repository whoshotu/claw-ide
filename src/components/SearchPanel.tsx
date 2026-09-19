import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import { searchWorkspace, readFile } from "../lib/invoke";

interface SearchPanelProps {
  tauriApi: any;
}

interface SearchResult {
  path: string;
  line: number;
  text: string;
}

export function SearchPanel({ tauriApi }: SearchPanelProps) {
  const { currentDirectory, openFile, setLeftView } = useAppStore();
  const [query, setQuery] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const runSearch = async () => {
    if (!currentDirectory || !query.trim()) {
      setResults([]);
      return;
    }
    if (!tauriApi?.invoke) {
      setError("Search is available in the desktop app.");
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const found = await searchWorkspace(currentDirectory, query, fileFilter, false);
      setResults(found);
    } catch (searchError) {
      setError(String(searchError));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [currentDirectory, query, fileFilter, tauriApi]);

  const openResult = async (result: SearchResult) => {
    try {
      const content = await readFile(result.path);
      openFile(result.path, content);
      setLeftView("explorer");
    } catch (openError) {
      setError(String(openError));
    }
  };

  return (
    <div className="search-panel">
      <div className="search-fields">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runSearch();
          }}
          placeholder="Search workspace"
          aria-label="Search workspace"
        />
        <input
          value={fileFilter}
          onChange={(event) => setFileFilter(event.target.value)}
          placeholder="Files to include (optional)"
          aria-label="Files to include"
        />
      </div>
      {!currentDirectory && <div className="search-empty">Open a folder to search it.</div>}
      {searching && <div className="search-status">Searching…</div>}
      {error && <div className="search-error">{error}</div>}
      {!searching && query.trim() && currentDirectory && results.length === 0 && !error && (
        <div className="search-empty">No matches found.</div>
      )}
      <div className="search-results">
        {results.map((result, index) => (
          <button key={`${result.path}:${result.line}:${index}`} className="search-result" onClick={() => void openResult(result)}>
            <span className="search-result-file">{result.path.split(/[/\\]/).pop()}</span>
            <span className="search-result-location">
              {result.path} · line {result.line}
            </span>
            <span className="search-result-text">{result.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
