import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./config";

const connection = new Connection(config.rpcUrl, "confirmed");
const feeCache = new Map<string, number | null>();

export async function getTransactionFee(signature: string): Promise<number | null> {
  if (feeCache.has(signature)) return feeCache.get(signature)!;
  try {
    const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const fee = tx?.meta?.fee;
    const result = typeof fee === "number" ? fee / 1_000_000_000 : null;
    feeCache.set(signature, result);
    return result;
  } catch (err) {
    console.warn(`[solanaRpc] getTransactionFee(${signature}) failed:`, (err as Error).message);
    return null;
  }
}

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
  top10ConcentrationPct: number | null;
  status: "complete" | "partial";
}

/**
 * Approximate holder count via Helius's getTokenAccounts DAS RPC method, which
 * paginates by cursor. Each page is ~1000 accounts and costs RPC credits, so
 * this is capped by config.holderLookupMaxPages. Set that to 0 to skip holder
 * lookups entirely (they're the most expensive call in this whole pipeline).
 *
 * Aggregates positive token balances by owner. The concentration denominator is
 * the observed positive balance, so capped results are explicitly partial.
 */
export async function getApproxHolderCount(mint: string): Promise<HolderEstimate | null> {
  if (config.holderLookupMaxPages <= 0) return null;

  try {
    let cursor: string | undefined = undefined;
    const balances = new Map<string, number>();
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: any = await res.json();
      const accounts = json?.result?.token_accounts ?? [];
      for (const account of accounts) {
        const amount = Number(account?.amount ?? account?.tokenAmount ?? 0);
        const owner = account?.owner;
        if (owner && Number.isFinite(amount) && amount > 0) {
          balances.set(owner, (balances.get(owner) ?? 0) + amount);
        }
      }

      cursor = json?.result?.cursor;
      if (!cursor || accounts.length < 1000) {
        const values = [...balances.values()].sort((a, b) => b - a);
        const total = values.reduce((sum, value) => sum + value, 0);
        return {
          count: values.length,
          capped: false,
          top10ConcentrationPct: total > 0 ? (values.slice(0, 10).reduce((sum, value) => sum + value, 0) / total) * 100 : null,
          status: "complete",
        };
      }
      if (page === config.holderLookupMaxPages - 1) {
        capped = true;
      }
    }
    const values = [...balances.values()].sort((a, b) => b - a);
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      count: values.length,
      capped,
      top10ConcentrationPct: total > 0 ? (values.slice(0, 10).reduce((sum, value) => sum + value, 0) / total) * 100 : null,
      status: "partial",
    };
  } catch (err) {
    console.warn(`[solanaRpc] getApproxHolderCount(${mint}) failed:`, (err as Error).message);
    return null;
  }
}
