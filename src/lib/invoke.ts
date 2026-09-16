import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "./types";

export const getCurrentDirectory = () =>
  invoke<string>("get_current_directory");

export const readDirectory = (path: string) =>
  invoke<FileEntry[]>("read_directory", { path });

export const readFile = (path: string) =>
  invoke<string>("read_file", { path });

export const writeFile = (path: string, content: string) =>
  invoke<void>("write_file", { path, content });

export const findClawBinary = () => invoke<string>("find_claw_binary");

export const checkClawVersion = () => invoke<string>("check_claw_version");

export const spawnClaw = (args: string[]) =>
  invoke<number>("spawn_claw", { args });

export const killClawProcess = (pid: number) =>
  invoke<void>("kill_claw_process", { pid });

export const spawnOpenClaw = (args: string[]) =>
  invoke<number>("spawn_openclaw", { args });

export const findOpenClawGateway = () =>
  invoke<string>("find_openclaw_gateway");
