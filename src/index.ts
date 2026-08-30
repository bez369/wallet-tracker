import { config } from "./config";
import { appendRow, ensureCsvHeader } from "./csvWriter";
import { enrichTrade } from "./enrich";
import { fetchNewTransactions } from "./heliusClient";
import { getLastProcessedSignature, loadState, saveState, setLastProcessedSignature } from "./state";
import { detectTrade } from "./tradeDetector";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollOnce(): Promise<void> {
  const lastSig = getLastProcessedSignature();
  const txs = await fetchNewTransactions(lastSig);

  if (txs.length === 0) return;

  console.log(`[poll] ${txs.length} new transaction(s) since last check`);

  for (const tx of txs) {
    const trade = detectTrade(tx);
    if (trade) {
      console.log(
        `[trade] ${trade.action} ${trade.mint} — ${trade.solAmount.toFixed(3)} SOL / ${trade.tokenAmount.toFixed(
          0
        )} tokens (${trade.signature})`
      );
      try {
        const row = await enrichTrade(trade);
        appendRow(row);
      } catch (err) {
        console.error(`[enrich] failed for ${trade.signature}:`, (err as Error).message);
        // We still advance lastProcessedSignature below so a bad enrichment
        // doesn't wedge the poller retrying forever — the trade itself is
        // logged to the console either way for manual follow-up.
      }
    } else if (config.debugLogSkipped) {
      console.log(
        `[skip] ${tx.signature} type=${tx.type} source=${tx.source} ` +
          `tokenTransfers=${tx.tokenTransfers?.length ?? 0} nativeTransfers=${tx.nativeTransfers?.length ?? 0}`
      );
    }
    setLastProcessedSignature(tx.signature);
  }

  saveState();
}

async function main() {
  console.log(`Tracking wallet ${config.targetWallet}`);
   console.log(
    config.relevantSources.length > 0
      ? `Filtering to sources: ${config.relevantSources.join(", ")}`
      : `No source filter — detecting trades from any program via transfer deltas`
  );
  console.log(`Polling every ${config.pollIntervalMs}ms, writing to ${config.csvPath}`);

  ensureCsvHeader();
  loadState();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[poll] error:", (err as Error).message);
    }
    await sleep(config.pollIntervalMs);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
