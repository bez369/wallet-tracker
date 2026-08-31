import * as fs from "fs";
import * as path from "path";

interface CsvRecord {
  [key: string]: string;
}

interface PositionState {
  qty: number;
  totalCostSol: number;
  lastBuyTs: number | null;
  lastSellTs: number | null;
  lastTradeTs: number | null;
  lastEntryPrice: number | null;
}

const OUTPUT_COLUMNS = [
  "timestamp_iso",
  "signature",
  "action",
  "mint",
  "token_name",
  "token_symbol",
  "token_amount",
  "sol_amount",
  "price_per_token_sol",
  "prev_qty",
  "qty_after_trade",
  "avg_cost_basis_after_trade",
  "realized_pnl_sol",
  "full_exit",
  "partial_exit",
  "reentry",
  "hold_time_sec",
  "time_since_last_trade_sec",
  "time_since_last_buy_sec",
  "time_since_last_sell_sec",
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

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function buildRecords(inputPath: string): CsvRecord[] {
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

export function buildPositionLedger(inputPath: string, outputPath: string): void {
  const trades = buildRecords(inputPath).sort((a, b) => {
    const ta = new Date(a.timestamp_iso).getTime();
    const tb = new Date(b.timestamp_iso).getTime();
    return ta - tb;
  });

  const byMint = new Map<string, PositionState>();
  const outRows: string[] = [];
  outRows.push(OUTPUT_COLUMNS.join(","));

  for (const trade of trades) {
    const mint = trade.mint;
    const ts = new Date(trade.timestamp_iso).getTime() / 1000;
    const action = (trade.action ?? "").toUpperCase();
    const tokenAmount = num(trade.token_amount);
    const solAmount = num(trade.sol_amount);
    const feeSol = num(trade.network_fee_sol) + num(trade.priority_fee_sol);
    const prevPos = byMint.get(mint) ?? {
      qty: 0,
      totalCostSol: 0,
      lastBuyTs: null,
      lastSellTs: null,
      lastTradeTs: null,
      lastEntryPrice: null,
    };

    const prevQty = prevPos.qty;
    const prevAvgCost = prevQty > 0 ? prevPos.totalCostSol / prevQty : 0;
    const prevTradeTs = prevPos.lastTradeTs;
    const prevBuyTs = prevPos.lastBuyTs;
    const prevSellTs = prevPos.lastSellTs;

    let qtyAfter = prevQty;
    let totalCostAfter = prevPos.totalCostSol;
    let realizedPnl = 0;
    let fullExit = false;
    let partialExit = false;
    let reentry = false;

    if (action === "BUY") {
      reentry = prevQty === 0;
      qtyAfter = prevQty + tokenAmount;
      totalCostAfter = prevPos.totalCostSol + solAmount + feeSol;
      prevPos.lastBuyTs = ts;
      prevPos.lastEntryPrice = solAmount / tokenAmount || prevPos.lastEntryPrice;
    } else if (action === "SELL") {
      const soldQty = Math.min(prevQty, tokenAmount);
      if (prevQty > 0) {
        const costBasis = soldQty * prevAvgCost;
        realizedPnl = solAmount - feeSol - costBasis;
        totalCostAfter = Math.max(0, prevPos.totalCostSol - costBasis);
        qtyAfter = Math.max(0, prevQty - soldQty);
        fullExit = qtyAfter === 0;
        partialExit = prevQty > 0 && qtyAfter > 0;
      }
      prevPos.lastSellTs = ts;
    }

    prevPos.qty = qtyAfter;
    prevPos.totalCostSol = totalCostAfter;
    prevPos.lastTradeTs = ts;
    byMint.set(mint, prevPos);

    const avgCostAfter = prevPos.qty > 0 ? prevPos.totalCostSol / prevPos.qty : 0;
    const holdTimeSec = action === "SELL" && prevBuyTs !== null ? ts - prevBuyTs : null;
    const timeSinceLastTradeSec = prevTradeTs !== null ? ts - prevTradeTs : null;
    const timeSinceLastBuySec = prevBuyTs !== null ? ts - prevBuyTs : null;
    const timeSinceLastSellSec = prevSellTs !== null ? ts - prevSellTs : null;

    const out = [
      trade.timestamp_iso,
      trade.signature,
      action,
      mint,
      trade.token_name ?? "",
      trade.token_symbol ?? "",
      trade.token_amount,
      trade.sol_amount,
      trade.price_per_token_sol ?? "",
      String(prevQty),
      String(qtyAfter),
      avgCostAfter.toString(),
      realizedPnl.toString(),
      fullExit ? "true" : "false",
      partialExit ? "true" : "false",
      reentry ? "true" : "false",
      holdTimeSec === null ? "" : String(holdTimeSec),
      timeSinceLastTradeSec === null ? "" : String(timeSinceLastTradeSec),
      timeSinceLastBuySec === null ? "" : String(timeSinceLastBuySec),
      timeSinceLastSellSec === null ? "" : String(timeSinceLastSellSec),
    ];

    outRows.push(out.map((v) => csvEscape(v)).join(","));
  }

  ensureDir(outputPath);
  fs.writeFileSync(outputPath, outRows.join("\n") + "\n");
}

if (require.main === module) {
  const inputPath = path.resolve(process.cwd(), process.argv[2] ?? "./data/entries.csv");
  const outputPath = path.resolve(process.cwd(), process.argv[3] ?? "./data/position-ledger.csv");
  buildPositionLedger(inputPath, outputPath);
  console.log(`Wrote position ledger to ${outputPath}`);
}
