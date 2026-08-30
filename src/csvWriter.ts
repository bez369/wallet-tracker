import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { CsvRow } from "./types";

const COLUMNS: (keyof CsvRow)[] = [
  "timestamp_iso",
  "signature",
  "action",
  "entry_number",
  "seconds_since_prev_entry",
  "sol_amount",
  "token_amount",
  "price_per_token_sol",
  "mint",
  "token_name",
  "token_symbol",
  "token_created_at_iso",
  "seconds_since_launch",
  "migrated",
  "market_cap_usd",
  "dev_wallet",
  "dev_wallet_sol_balance",
  "dev_tokens_created_count",
  "holder_count_approx",
  "holder_count_capped",
  "volume_5m_usd",
  "volume_1h_usd",
  "volume_24h_usd",
  "liquidity_usd",
  "price_change_5m_pct",
  "price_change_1h_pct",
  "txns_24h_buys",
  "txns_24h_sells",
];

function escapeCsvValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ensureCsvHeader(): void {
  fs.mkdirSync(path.dirname(config.csvPath), { recursive: true });
  if (!fs.existsSync(config.csvPath)) {
    fs.writeFileSync(config.csvPath, COLUMNS.join(",") + "\n");
  }
}

export function appendRow(row: CsvRow): void {
  ensureCsvHeader();
  const line = COLUMNS.map((c) => escapeCsvValue(row[c])).join(",") + "\n";
  fs.appendFileSync(config.csvPath, line);
}
