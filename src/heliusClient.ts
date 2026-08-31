import axios from "axios";
import { config } from "./config";
import { HeliusEnhancedTransaction } from "./types";

const BASE = "https://api.helius.xyz/v0";

/**
 * Fetch one page of enhanced transactions for the target wallet, newest first.
 * `before` paginates backward in time (pass a signature to get txs older than it).
 */
export async function fetchTransactionsPage(before?: string): Promise<HeliusEnhancedTransaction[]> {
  const url = `${BASE}/addresses/${config.targetWallet}/transactions`;
  const params: Record<string, string | number> = {
    "api-key": config.heliusApiKey,
    limit: config.pageSize,
  };
  if (before) params.before = before;

  const { data } = await axios.get<HeliusEnhancedTransaction[]>(url, { params, timeout: 15000 });
  return data ?? [];
}

/**
 * Pull every transaction newer than `sinceSignature` (exclusive).
 * If `sinceSignature` is null (first run ever), just returns the most recent page
 * so we don't try to backfill the wallet's entire history.
 * Returns oldest -> newest so callers can process in chronological order.
 */
export async function fetchNewTransactions(sinceSignature: string | null): Promise<HeliusEnhancedTransaction[]> {
  const collected: HeliusEnhancedTransaction[] = [];
  const seen = new Set<string>();
  let before: string | undefined = undefined;
  const MAX_PAGES = 20; // safety cap in case the wallet is extremely active between polls

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchTransactionsPage(before);
    if (batch.length === 0) break;

    if (sinceSignature === null) {
      // First run: don't backfill, just seed with the newest page.
      return batch.filter((tx) => !seen.has(tx.signature) && seen.add(tx.signature)).reverse();
    }

    const cutoffIndex = batch.findIndex((tx) => tx.signature === sinceSignature);
    if (cutoffIndex === -1) {
      // Haven't reached the known signature yet — keep everything and page further back.
      for (const tx of batch) {
        if (!seen.has(tx.signature)) {
          seen.add(tx.signature);
          collected.push(tx);
        }
      }
      before = batch[batch.length - 1].signature;
      continue;
    } else {
      // Found it — keep only the transactions newer than it, then stop.
      for (const tx of batch.slice(0, cutoffIndex)) {
        if (!seen.has(tx.signature)) {
          seen.add(tx.signature);
          collected.push(tx);
        }
      }
      return collected.reverse();
    }
  }

  // Hit the safety cap without finding sinceSignature (huge gap, or it aged out of
  // Helius's history). Process what we found rather than looping forever.
  return collected.reverse();
}
