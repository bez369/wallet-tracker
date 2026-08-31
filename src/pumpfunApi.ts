import axios from "axios";
import { config } from "./config";
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
    return null;
  }
}

export interface DevTokenCount {
  count: number;
  capped: boolean;
}

const devCoinCountCache = new Map<string, DevTokenCount | null>();

interface HeliusAssetsByCreatorResponse {
  result?: {
    total?: number;
    items?: unknown[];
    page?: number;
  };
  error?: { message?: string };
}

/**
 * How many coins this dev wallet has created on pump.fun (best-effort — count
 * comes from a paginated endpoint, we page until it stops returning results).
 */
export async function getDevTokensCreatedCount(devWallet: string): Promise<DevTokenCount | null> {
  if (devCoinCountCache.has(devWallet)) return devCoinCountCache.get(devWallet)!;
  try {
    const { data } = await axios.post<HeliusAssetsByCreatorResponse>(
      config.rpcUrl,
      {
        jsonrpc: "2.0",
        id: "dev-assets",
        method: "getAssetsByCreator",
        params: {
          creatorAddress: devWallet,
          page: 1,
          limit: 1,
          displayOptions: { showFungible: true },
        },
      },
      { timeout: 15000 }
    );
    if (data.error) throw new Error(data.error.message ?? "Helius DAS error");
    const total = data.result?.total;
    if (!Number.isFinite(total)) throw new Error("Helius DAS response did not include total");
    const result = { count: total!, capped: false };
    devCoinCountCache.set(devWallet, result);
    return result;
  } catch (err) {
    console.warn(`[pumpfunApi] getDevTokensCreatedCount(${devWallet}) failed:`, (err as Error).message);
    return null;
  }
}
