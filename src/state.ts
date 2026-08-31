import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { MintHistoryEntry, PersistedState } from "./types";

const emptyState = (): PersistedState => ({
  lastProcessedSignature: null,
  mintHistory: {},
  processedSignatures: {},
});

let state: PersistedState = emptyState();

export function loadState(): PersistedState {
  try {
    const raw = fs.readFileSync(config.statePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    state = {
      lastProcessedSignature: parsed.lastProcessedSignature ?? null,
      mintHistory: parsed.mintHistory ?? {},
      processedSignatures: parsed.processedSignatures ?? {},
    };
    for (const entries of Object.values(state.mintHistory)) {
      const uniqueEntries = entries.filter((entry, index, all) =>
        all.findIndex((candidate) => candidate.signature === entry.signature) === index
      );
      entries.splice(0, entries.length, ...uniqueEntries);
      for (const entry of uniqueEntries) state.processedSignatures[entry.signature] = true;
    }
  } catch {
    state = emptyState();
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

export function hasProcessed(signature: string): boolean {
  return state.processedSignatures[signature] === true;
}

export function markProcessed(signature: string): void {
  state.processedSignatures[signature] = true;
}

export function getMintHistory(mint: string): MintHistoryEntry[] {
  return state.mintHistory[mint] ?? [];
}

export function recordTrade(mint: string, entry: MintHistoryEntry): void {
  if (state.mintHistory[mint]?.some((existing) => existing.signature === entry.signature)) return;
  if (!state.mintHistory[mint]) state.mintHistory[mint] = [];
  state.mintHistory[mint].push(entry);
}
