// --- Helius Enhanced Transaction (subset of fields we actually use) ---

export interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  mint: string;
  tokenAmount: number;
}

export interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // lamports
}

export interface HeliusSwapEvent {
  nativeInput?: { account: string; amount: string } | null;
  nativeOutput?: { account: string; amount: string } | null;
  tokenInputs?: Array<{ userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>;
  tokenOutputs?: Array<{ userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>;
}

export interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number; // unix seconds
  type: string;
  source: string; // e.g. PUMP_FUN, PUMP_AMM, RAYDIUM, JUPITER
  feePayer: string;
  tokenTransfers: HeliusTokenTransfer[];
  nativeTransfers: HeliusNativeTransfer[];
  events?: {
    swap?: HeliusSwapEvent;
  };
}

// --- Our internal representation of one detected trade ---

export type TradeAction = "BUY" | "SELL";

export interface DetectedTrade {
  signature: string;
  timestampSec: number;
  action: TradeAction;
  mint: string;
  solAmount: number; // in SOL, not lamports
  tokenAmount: number; // in whole tokens, not raw
}

// --- pump.fun coin metadata (subset) ---

export interface PumpFunCoin {
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  created_timestamp: number; // ms
  market_cap: number;
  usd_market_cap: number;
  complete: boolean; // true once bonding curve is filled / migrated
  virtual_sol_reserves: number;
  virtual_token_reserves: number;
  king_of_the_hill_timestamp?: number | null;
}

// --- Dexscreener pair (subset) ---

export interface DexscreenerPair {
  volume: { m5: number; h1: number; h6: number; h24: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  liquidity?: { usd: number };
  txns: { h24: { buys: number; sells: number } };
  pairCreatedAt?: number;
  priceUsd?: string;
  quoteToken?: { symbol?: string };
}

// --- Per-mint history we persist locally, to detect re-entries ---

export interface MintHistoryEntry {
  signature: string;
  timestampSec: number;
  action: TradeAction;
  solAmount: number;
  tokenAmount: number;
}

export interface PersistedState {
  lastProcessedSignature: string | null;
  mintHistory: Record<string, MintHistoryEntry[]>;
  processedSignatures: Record<string, true>;
}

// --- Final enriched row written to CSV ---

export interface CsvRow {
  timestamp_iso: string;
  signature: string;
  action: TradeAction;
  entry_number: number; // 1st, 2nd, 3rd... buy into this mint by this wallet. For sells: how many buys preceded it.
  seconds_since_prev_entry: number | ""; // blank if this is the first entry
  sol_amount: number;
  token_amount: number;
  price_per_token_sol: number;
  mint: string;
  token_name: string;
  token_symbol: string;
  token_created_at_iso: string | "";
  seconds_since_launch: number | "";
  migrated: boolean | "";
  market_cap_usd: number | "";
  dev_wallet: string | "";
  dev_wallet_sol_balance: number | "";
  dev_tokens_created_count: number | "";
  holder_count_approx: number | "";
  holder_count_capped: boolean | "";
  volume_5m_usd: number | "";
  volume_1h_usd: number | "";
  volume_24h_usd: number | "";
  liquidity_usd: number | "";
  price_change_5m_pct: number | "";
  price_change_1h_pct: number | "";
  txns_24h_buys: number | "";
  txns_24h_sells: number | "";
  network_fee_sol: number | "";
  priority_fee_sol: number | "";
  position_token_amount: number | "";
  position_cost_basis_sol: number | "";
  decision_cluster_id: string;
  decision_cluster_member_count: number;
  sol_usd_price: number | "";
  sol_usd_quote_timestamp_iso: string | "";
  sol_usd_quote_source: string | "";
  sol_amount_usd: number | "";
  bonding_curve_status: "known" | "unavailable" | "";
  bonding_curve_completion_pct: number | "";
  dev_tokens_created_status: "known" | "capped" | "unavailable" | "";
  holder_count: number | "";
  top10_holder_concentration_pct: number | "";
  holder_data_status: "complete" | "partial" | "unavailable" | "";
}
