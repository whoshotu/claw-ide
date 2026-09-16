export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type ClawStatus = "unknown" | "ok" | "outdated" | "missing";
