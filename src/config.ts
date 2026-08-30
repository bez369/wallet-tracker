import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
  }
  return v;
}

export const config = {
  heliusApiKey: required("HELIUS_API_KEY"),
  targetWallet: required("TARGET_WALLET"),
  rpcUrl: required("RPC_URL"),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 20000),
  pageSize: Number(process.env.PAGE_SIZE ?? 100),
  csvPath: path.resolve(process.cwd(), process.env.CSV_PATH ?? "./data/entries.csv"),
  statePath: path.resolve(process.cwd(), process.env.STATE_PATH ?? "./state/state.json"),
  holderLookupMaxPages: Number(process.env.HOLDER_LOOKUP_MAX_PAGES ?? 3),
  relevantSources: (process.env.RELEVANT_SOURCES ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
  debugLogSkipped: (process.env.DEBUG_LOG_SKIPPED ?? "false").toLowerCase() === "true",
};
