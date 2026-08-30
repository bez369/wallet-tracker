import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./config";

const connection = new Connection(config.rpcUrl, "confirmed");

export async function getSolBalance(wallet: string): Promise<number | null> {
  try {
    const lamports = await connection.getBalance(new PublicKey(wallet), "confirmed");
    return lamports / 1_000_000_000;
  } catch (err) {
    console.warn(`[solanaRpc] getSolBalance(${wallet}) failed:`, (err as Error).message);
    return null;
  }
}

export interface HolderEstimate {
  count: number;
  capped: boolean; // true if we stopped paging early (see HOLDER_LOOKUP_MAX_PAGES)
}

/**
 * Approximate holder count via Helius's getTokenAccounts DAS RPC method, which
 * paginates by cursor. Each page is ~1000 accounts and costs RPC credits, so
 * this is capped by config.holderLookupMaxPages. Set that to 0 to skip holder
 * lookups entirely (they're the most expensive call in this whole pipeline).
 *
 * This counts *token accounts*, not unique owners, and includes zero-balance
 * accounts pump.fun sometimes leaves behind — treat it as directional, not exact.
 */
export async function getApproxHolderCount(mint: string): Promise<HolderEstimate | null> {
  if (config.holderLookupMaxPages <= 0) return null;

  try {
    let cursor: string | undefined = undefined;
    let count = 0;
    let capped = false;

    for (let page = 0; page < config.holderLookupMaxPages; page++) {
      const body = {
        jsonrpc: "2.0",
        id: "holder-lookup",
        method: "getTokenAccounts",
        params: { mint, limit: 1000, cursor },
      };
      const res = await fetch(config.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: any = await res.json();
      const accounts = json?.result?.token_accounts ?? [];
      count += accounts.length;

      cursor = json?.result?.cursor;
      if (!cursor || accounts.length < 1000) {
        return { count, capped: false };
      }
      if (page === config.holderLookupMaxPages - 1) {
        capped = true;
      }
    }
    return { count, capped };
  } catch (err) {
    console.warn(`[solanaRpc] getApproxHolderCount(${mint}) failed:`, (err as Error).message);
    return null;
  }
}
