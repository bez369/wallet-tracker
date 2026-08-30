import * as fs from "fs";
import * as path from "path";

interface CsvRecord {
  [key: string]: string;
}

const OUTPUT_COLUMNS = [
  "mint",
  "token_name",
  "token_symbol",
  "total_buys",
  "total_sells",
  "full_exits",
  "partial_exits",
  "reentries_after_full_exit",
  "reentries_after_partial_exit",
  "avg_hold_time_sec",
  "avg_buy_size_sol",
  "avg_sell_size_sol",
  "avg_buy_size_tokens",
  "avg_sell_size_tokens",
  "first_seen",
  "last_seen",
];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result;
}

function num(value: string | undefined): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function readCsv(inputPath: string): CsvRecord[] {
  const text = fs.readFileSync(inputPath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const rec: CsvRecord = {};
    headers.forEach((header, idx) => {
      rec[header] = values[idx] ?? "";
    });
    return rec;
  });
}

export function buildReentrySummary(inputPath: string, outputPath: string): void {
  const rows = readCsv(inputPath);
  const byMint = new Map<string, any>();

  for (const row of rows) {
    const mint = row.mint;
    const action = (row.action ?? "").toUpperCase();
    const name = row.token_name ?? "";
    const symbol = row.token_symbol ?? "";
const ts = new Date(row.timestamp_iso).getTime();

    if (!byMint.has(mint)) {
      byMint.set(mint, {
        mint,
        token_name: name,
        token_symbol: symbol,
        buys: 0,
        sells: 0,
        fullExits: 0,
        partialExits: 0,
        reentriesAfterFullExit: 0,
        reentriesAfterPartialExit: 0,
        totalHoldSec: 0,
        holdCount: 0,
        buySolTotal: 0,
        sellSolTotal: 0,
        buyTokenTotal: 0,
        sellTokenTotal: 0,
        firstSeen: ts,
        lastSeen: ts,
      });
    }

    const record = byMint.get(mint);
    record.firstSeen = Math.min(record.firstSeen, ts);
    record.lastSeen = Math.max(record.lastSeen, ts);

    if (action === "BUY") {
      record.buys += 1;
      record.buySolTotal += num(row.sol_amount);
      record.buyTokenTotal += num(row.token_amount);
    }

    if (action === "SELL") {
      record.sells += 1;
      record.sellSolTotal += num(row.sol_amount);
      record.sellTokenTotal += num(row.token_amount);
      if (row.full_exit === "true") record.fullExits += 1;
      if (row.partial_exit === "true") record.partialExits += 1;
    }

    if (row.reentry === "true") {
      if (row.full_exit === "true") record.reentriesAfterFullExit += 1;
      if (row.partial_exit === "true") record.reentriesAfterPartialExit += 1;
    }

    if (row.hold_time_sec && Number(row.hold_time_sec) > 0) {
      record.totalHoldSec += Number(row.hold_time_sec);
      record.holdCount += 1;
    }
  }

  const out: string[] = [];
  out.push(OUTPUT_COLUMNS.join(","));

  for (const mint of [...byMint.keys()].sort()) {
    const r = byMint.get(mint);
    const avgHold = r.holdCount > 0 ? r.totalHoldSec / r.holdCount : 0;
    const avgBuySol = r.buys > 0 ? r.buySolTotal / r.buys : 0;
    const avgSellSol = r.sells > 0 ? r.sellSolTotal / r.sells : 0;
    const avgBuyToken = r.buys > 0 ? r.buyTokenTotal / r.buys : 0;
    const avgSellToken = r.sells > 0 ? r.sellTokenTotal / r.sells : 0;

    const row = [
      r.mint,
      r.token_name,
      r.token_symbol,
      String(r.buys),
      String(r.sells),
      String(r.fullExits),
      String(r.partialExits),
      String(r.reentriesAfterFullExit),
      String(r.reentriesAfterPartialExit),
      String(avgHold),
      String(avgBuySol),
      String(avgSellSol),
      String(avgBuyToken),
      String(avgSellToken),
      new Date(r.firstSeen).toISOString(),
      new Date(r.lastSeen).toISOString(),
    ];

    out.push(row.map((v) => csvEscape(v)).join(","));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, out.join("\n") + "\n");
}

if (require.main === module) {
  const inputPath = path.resolve(process.cwd(), process.argv[2] ?? "./data/position-ledger.csv");
  const outputPath = path.resolve(process.cwd(), process.argv[3] ?? "./data/reentry-summary.csv");
  buildReentrySummary(inputPath, outputPath);
  console.log(`Wrote re-entry summary to ${outputPath}`);
}
