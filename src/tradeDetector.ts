import { config } from "./config";
import { DetectedTrade, HeliusEnhancedTransaction } from "./types";

const LAMPORTS_PER_SOL = 1_000_000_000;
const BASE_SIGNATURE_FEE_LAMPORTS = 5_000;
const WSOL_MINT = "So11111111111111111111111111111111111112";

function parseRawTokenAmount(tokenAmount: string | number | undefined, decimals?: number): number {
  if (tokenAmount === undefined || tokenAmount === null || tokenAmount === "") return 0;
  const value = String(tokenAmount).trim();
  if (!value) return 0;

  const decimalPlaces = Number(decimals ?? 0);
  const divisor = 10 ** decimalPlaces;
  return Number(value) / divisor;
}

function addTokenDelta(tokenDeltas: Map<string, number>, mint: string, delta: number): void {
  if (!mint) return;
  tokenDeltas.set(mint, (tokenDeltas.get(mint) ?? 0) + delta);
}

function maybeRecordNativeSwapSide(
  wallet: string,
  side: { account?: string; amount?: string | number } | Array<{ account?: string; amount?: string | number }> | null | undefined,
  direction: "in" | "out",
  netSolLamports: { value: number }
): void {
  if (!side) return;

  const entries = Array.isArray(side) ? side : [side];
  for (const entry of entries) {
    if (!entry?.account || !entry.amount) continue;
    if (entry.account !== wallet) continue;
    const lamports = Number(entry.amount);
    if (direction === "in") netSolLamports.value += lamports;
    else netSolLamports.value -= lamports;
  }
}

export function detectTrade(tx: HeliusEnhancedTransaction): DetectedTrade | null {
  if (config.relevantSources.length > 0) {
    if (!config.relevantSources.includes((tx.source ?? "").toUpperCase())) return null;
  }

  const wallet = config.targetWallet;
  const tokenDeltas = new Map<string, number>();
  const netSolLamports = { value: 0 };

  const swap = tx.events?.swap;

  if (swap) {
    maybeRecordNativeSwapSide(wallet, swap.nativeInput, "in", netSolLamports);
    maybeRecordNativeSwapSide(wallet, swap.nativeOutput, "out", netSolLamports);

    for (const input of swap.tokenInputs ?? []) {
      if (input.userAccount !== wallet) continue;
      const amount = parseRawTokenAmount(input.rawTokenAmount?.tokenAmount, input.rawTokenAmount?.decimals);
      if (input.mint === WSOL_MINT) {
        netSolLamports.value -= amount * LAMPORTS_PER_SOL;
        continue;
      }
      addTokenDelta(tokenDeltas, input.mint, -amount);
    }

    for (const output of swap.tokenOutputs ?? []) {
      if (output.userAccount !== wallet) continue;
      const amount = parseRawTokenAmount(output.rawTokenAmount?.tokenAmount, output.rawTokenAmount?.decimals);
      if (output.mint === WSOL_MINT) {
        netSolLamports.value += amount * LAMPORTS_PER_SOL;
        continue;
      }
      addTokenDelta(tokenDeltas, output.mint, amount);
    }
  } else {
    for (const nt of tx.nativeTransfers ?? []) {
      if (nt.toUserAccount === wallet) netSolLamports.value += Number(nt.amount);
      if (nt.fromUserAccount === wallet) netSolLamports.value -= Number(nt.amount);
    }

    for (const tt of tx.tokenTransfers ?? []) {
      if (tt.mint === WSOL_MINT) {
        const raw = Number(tt.tokenAmount) * LAMPORTS_PER_SOL;
        if (tt.toUserAccount === wallet) netSolLamports.value += raw;
        if (tt.fromUserAccount === wallet) netSolLamports.value -= raw;
        continue;
      }
      if (tt.toUserAccount !== wallet && tt.fromUserAccount !== wallet) continue;
      addTokenDelta(tokenDeltas, tt.mint, tt.toUserAccount === wallet ? tt.tokenAmount : -tt.tokenAmount);
    }
  }

  const EPS = 1e-9;
  const movedMints = [...tokenDeltas.entries()].filter(([, delta]) => Math.abs(delta) > EPS);

  if (movedMints.length === 0) return null;

  const [primaryMint, primaryDelta] = movedMints.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const secondaryNoise = movedMints
    .filter(([mint]) => mint !== primaryMint)
    .reduce((sum, [, delta]) => sum + Math.abs(delta), 0);

  if (secondaryNoise > Math.abs(primaryDelta) * 0.2) return null;
  if (Math.abs(netSolLamports.value) < 1) return null;

  const solAmount = Math.abs(netSolLamports.value) / LAMPORTS_PER_SOL;
  const tokenAmount = Math.abs(primaryDelta);
  const feeSol = typeof tx.fee === "number" ? tx.fee / LAMPORTS_PER_SOL : "";
  const priorityFeeSol = typeof tx.fee === "number"
    ? Math.max(0, tx.fee - BASE_SIGNATURE_FEE_LAMPORTS) / LAMPORTS_PER_SOL
    : "";

  if (primaryDelta > 0 && netSolLamports.value < 0) {
    return { signature: tx.signature, timestampSec: tx.timestamp, action: "BUY", mint: primaryMint, solAmount, tokenAmount, feeSol, priorityFeeSol };
  }
  if (primaryDelta < 0 && netSolLamports.value > 0) {
    return { signature: tx.signature, timestampSec: tx.timestamp, action: "SELL", mint: primaryMint, solAmount, tokenAmount, feeSol, priorityFeeSol };
  }

  return null;
}