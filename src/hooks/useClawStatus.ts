import { useEffect, useState } from "react";
import { checkClawVersion, findClawBinary } from "../lib/invoke";
import type { ClawStatus } from "../lib/types";

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function useClawStatus(minVersion: string) {
  const [status, setStatus] = useState<ClawStatus>("unknown");
  const [version, setVersion] = useState<string | null>(null);
  const [binaryPath, setBinaryPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const bin = await findClawBinary();
        const raw = await checkClawVersion();
        if (cancelled) return;
        const match = raw.match(/(\d+\.\d+\.\d+)/);
        const v = match ? match[1] : null;
        setBinaryPath(bin);
        setVersion(v);
        setStatus(v && compareSemver(v, minVersion) >= 0 ? "ok" : "outdated");
      } catch {
        if (!cancelled) setStatus("missing");
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [minVersion]);

  return { status, version, binaryPath };
}
