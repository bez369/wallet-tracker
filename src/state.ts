import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { MintHistoryEntry, PersistedState } from "./types";

let state: PersistedState = { lastProcessedSignature: null, mintHistory: {} };

export function loadState(): PersistedState {
  try {
    const raw = fs.readFileSync(config.statePath, "utf-8");
    state = JSON.parse(raw);
  } catch {
    state = { lastProcessedSignature: null, mintHistory: {} };
  }
  return state;
}

export function saveState(): void {
  fs.mkdirSync(path.dirname(config.statePath), { recursive: true });
  // write to a temp file then rename, so a crash mid-write can't corrupt state
  const tmp = `${config.statePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, config.statePath);
}

export function getLastProcessedSignature(): string | null {
  return state.lastProcessedSignature;
}

export function setLastProcessedSignature(sig: string): void {
  state.lastProcessedSignature = sig;
}

export function getMintHistory(mint: string): MintHistoryEntry[] {
  return state.mintHistory[mint] ?? [];
}

export function recordTrade(mint: string, entry: MintHistoryEntry): void {
  if (!state.mintHistory[mint]) state.mintHistory[mint] = [];
  state.mintHistory[mint].push(entry);
}
