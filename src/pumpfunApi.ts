import axios from "axios";
import { PumpFunCoin } from "./types";

// This is pump.fun's public frontend API. It's unofficial and undocumented —
// it can change shape or start rate-limiting/blocking cloud IPs without notice.
// If it stops working, the fix is usually: (a) update the URL/fields below to
// match whatever pump.fun's site is calling now (check Network tab on
// pump.fun), or (b) swap in a paid provider (Solana Tracker, Bitquery, Moralis
// all mirror this data) behind the same getCoin()/getCoinsCreatedBy() signatures.

const BASE = "https://frontend-api-v3.pump.fun";

const client = axios.create({
  timeout: 10000,
  headers: {
    // pump.fun's edge has been known to reject requests with no browser-like UA.
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "application/json",
  },
});

const coinCache = new Map<string, PumpFunCoin | null>();

export async function getCoin(mint: string): Promise<PumpFunCoin | null> {
  if (coinCache.has(mint)) return coinCache.get(mint)!;
  try {
    const { data } = await client.get<PumpFunCoin>(`${BASE}/coins/${mint}`);
    coinCache.set(mint, data);
    return data;
  } catch (err) {
    console.warn(`[pumpfunApi] getCoin(${mint}) failed:`, (err as Error).message);
    coinCache.set(mint, null);
    return null;
  }
}

const devCoinCountCache = new Map<string, number | null>();

/**
 * How many coins this dev wallet has created on pump.fun (best-effort — count
 * comes from a paginated endpoint, we page until it stops returning results).
 */
export async function getDevTokensCreatedCount(devWallet: string): Promise<number | null> {
  if (devCoinCountCache.has(devWallet)) return devCoinCountCache.get(devWallet)!;
  try {
    let total = 0;
    let offset = 0;
    const limit = 50;
    for (let i = 0; i < 10; i++) {
      // hard cap: 500 coins is plenty to prove "serial deployer"
      const { data } = await client.get<PumpFunCoin[]>(`${BASE}/coins/user-created-coins/${devWallet}`, {
        params: { offset, limit, includeNsfw: true },
      });
      if (!Array.isArray(data) || data.length === 0) break;
      total += data.length;
      offset += limit;
      if (data.length < limit) break;
    }
    devCoinCountCache.set(devWallet, total);
    return total;
  } catch (err) {
    console.warn(`[pumpfunApi] getDevTokensCreatedCount(${devWallet}) failed:`, (err as Error).message);
    devCoinCountCache.set(devWallet, null);
    return null;
  }
}
