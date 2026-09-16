import { useCallback, useEffect, useState } from "react";
import { readDirectory } from "../lib/invoke";
import type { FileEntry } from "../lib/types";

export function useFileTree(rootPath: string | null) {
  const [entries, setEntries] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    try {
      const dirEntries = await readDirectory(path);
      setEntries((prev) => ({ ...prev, [path]: dirEntries }));
      setError(null);
      return dirEntries;
    } catch (e) {
      setError(String(e));
      return [] as FileEntry[];
    }
  }, []);

  const toggle = useCallback(
    async (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
      if (!entries[path]) {
        await load(path);
      }
    },
    [entries, load],
  );

  useEffect(() => {
    if (rootPath) void load(rootPath);
  }, [rootPath, load]);

  return { entries, expanded, toggle, load, error };
}
