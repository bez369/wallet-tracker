import { getBestPair } from "./dexscreener";
import { getCoin, getDevTokensCreatedCount } from "./pumpfunApi";
import { getApproxHolderCount, getSolBalance } from "./solanaRpc";
import { getMintHistory, recordTrade } from "./state";
import { CsvRow, DetectedTrade } from "./types";

export async function enrichTrade(trade: DetectedTrade): Promise<CsvRow> {
  const priorHistory = getMintHistory(trade.mint); // everything we've seen before this trade
  const priorBuys = priorHistory.filter((h) => h.action === "BUY");

  // entry_number: for a BUY, which numbered entry this is into the mint.
  // for a SELL, how many prior buys preceded it (context for "he sold after N adds").
  const entryNumber = trade.action === "BUY" ? priorBuys.length + 1 : priorBuys.length;

  let secondsSincePrevEntry: number | "" = "";
  const prevBuy = priorBuys[priorBuys.length - 1];
  if (prevBuy) {
    secondsSincePrevEntry = trade.timestampSec - prevBuy.timestampSec;
  }

  // Fire off independent lookups in parallel — coin info is needed first to get
  // the dev wallet, so that one goes first, then dev-balance/dev-count/holders/
  // dexscreener all run concurrently.
  const coin = await getCoin(trade.mint);

  const [devBalance, devCount, holderEstimate, pair] = await Promise.all([
    coin?.creator ? getSolBalance(coin.creator) : Promise.resolve(null),
    coin?.creator ? getDevTokensCreatedCount(coin.creator) : Promise.resolve(null),
    getApproxHolderCount(trade.mint),
    getBestPair(trade.mint),
  ]);

  const tokenCreatedAtSec = coin ? Math.floor(coin.created_timestamp / 1000) : null;

  const row: CsvRow = {
    timestamp_iso: new Date(trade.timestampSec * 1000).toISOString(),
    signature: trade.signature,
    action: trade.action,
    entry_number: entryNumber,
    seconds_since_prev_entry: secondsSincePrevEntry,
    sol_amount: trade.solAmount,
    token_amount: trade.tokenAmount,
    price_per_token_sol: trade.tokenAmount > 0 ? trade.solAmount / trade.tokenAmount : 0,
    mint: trade.mint,
    token_name: coin?.name ?? "",
    token_symbol: coin?.symbol ?? "",
    token_created_at_iso: tokenCreatedAtSec ? new Date(tokenCreatedAtSec * 1000).toISOString() : "",
    seconds_since_launch: tokenCreatedAtSec ? trade.timestampSec - tokenCreatedAtSec : "",
    migrated: coin ? coin.complete : "",
    market_cap_usd: coin?.usd_market_cap ?? "",
    dev_wallet: coin?.creator ?? "",
    dev_wallet_sol_balance: devBalance ?? "",
    dev_tokens_created_count: devCount ?? "",
    holder_count_approx: holderEstimate?.count ?? "",
    holder_count_capped: holderEstimate?.capped ?? "",
    volume_5m_usd: pair?.volume?.m5 ?? "",
    volume_1h_usd: pair?.volume?.h1 ?? "",
    volume_24h_usd: pair?.volume?.h24 ?? "",
    liquidity_usd: pair?.liquidity?.usd ?? "",
    price_change_5m_pct: pair?.priceChange?.m5 ?? "",
    price_change_1h_pct: pair?.priceChange?.h1 ?? "",
    txns_24h_buys: pair?.txns?.h24?.buys ?? "",
    txns_24h_sells: pair?.txns?.h24?.sells ?? "",
  };

  // Record this trade into history *after* computing entry_number/seconds_since_prev_entry
  // above, so the next trade on this mint sees it correctly.
  recordTrade(trade.mint, {
    signature: trade.signature,
    timestampSec: trade.timestampSec,
    action: trade.action,
    solAmount: trade.solAmount,
    tokenAmount: trade.tokenAmount,
  });

  return row;
}
