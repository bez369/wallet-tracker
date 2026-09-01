import axios from "axios";
import { DexscreenerPair } from "./types";

const BASE = "https://api.dexscreener.com/latest/dex/tokens";

interface DexscreenerResponse {
  pairs: DexscreenerPair[] | null;
}

/**
 * Returns the highest-liquidity pair for this mint (works both pre- and
 * post-migration once Dexscreener has indexed it; brand-new bonding-curve-only
 * tokens may not show up yet, which is expected — fields come back blank).
 */
export async function getBestPair(mint: string): Promise<DexscreenerPair | null> {
  try {
    const { data } = await axios.get<DexscreenerResponse>(`${BASE}/${mint}`, { timeout: 10000 });
    if (!data.pairs || data.pairs.length === 0) return null;
    return data.pairs.reduce((best, p) =>
      (p.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? p : best
    );
  } catch (err) {
    console.warn(`[dexscreener] getBestPair(${mint}) failed:`, (err as Error).message);
    return null;
  }
}

export interface SolUsdQuote {
  priceUsd: number;
  timestampSec: number;
  source: string;
}

let solUsdQuoteCache: SolUsdQuote | null = null;
let solUsdQuoteMinute = -1;

export async function getSolUsdQuote(): Promise<SolUsdQuote | null> {
  const minute = Math.floor(Date.now() / 60_000);
  if (solUsdQuoteCache && solUsdQuoteMinute === minute) return solUsdQuoteCache;

  try {
    const { data } = await axios.get<{ solana?: { usd?: number } }>(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { timeout: 10000 }
    );
    const priceUsd = Number(data.solana?.usd);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
    solUsdQuoteCache = { priceUsd, timestampSec: Math.floor(Date.now() / 1000), source: "coingecko" };
    solUsdQuoteMinute = minute;
    return solUsdQuoteCache;
  } catch (err) {
    console.warn("[dexscreener] getSolUsdQuote failed:", (err as Error).message);
    return solUsdQuoteCache;
  }
}
