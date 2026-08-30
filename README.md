# wallet-tracker

Watches one Solana wallet, detects its pump.fun trades (bonding-curve and
post-migration), and writes an enriched CSV row per trade so you can analyze
entries, re-entries, and exits offline.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `HELIUS_API_KEY` — free tier is enough for tracking one wallet
  (helius.dev). This is what powers the transaction feed.
- `RPC_URL` — a Solana RPC endpoint. Easiest is to use your Helius key here
  too: `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`. This is used for
  the dev wallet's SOL balance and the holder-count estimate.
- `TARGET_WALLET` — defaults to the wallet you gave me.

Then:

```bash
npm run build
npm start
```

It polls every `POLL_INTERVAL_MS` (default 20s), so it's near-real-time, not
a true push feed. Good enough for this — pump.fun trades aren't so fast that
a 20s lag matters for after-the-fact analysis.

**First run doesn't backfill history.** It seeds from whatever's most recent
and tracks forward from there, so you'll build up entry/re-entry data as it
happens rather than starting with a fully-formed picture. If you want his
past week's trades too, see "Backfilling history" below.

State (last processed signature + this wallet's buy/sell history per mint)
persists to `state/state.json`, so you can stop and restart the process
without losing re-entry tracking or double-logging trades.

## What ends up in the CSV

One row per detected BUY or SELL. The columns that matter for your
"when does he re-enter" question:

- `entry_number` — 1 for his first buy into a mint, 2 for the second, etc.
  For sells, it's how many buys preceded it.
- `seconds_since_prev_entry` — time between this buy and his previous buy on
  the *same* mint. This is the number you want for "how long does he wait
  before adding."
- `price_change_5m_pct` / `price_change_1h_pct`, `volume_5m_usd` /
  `volume_1h_usd`, `market_cap_usd` — the token's state *at the moment of his
  trade*, so you can correlate re-entries with "token pumped X% since his
  first buy" or "volume crossed Y."
- `dev_wallet_sol_balance`, `dev_tokens_created_count` — whether he's more
  willing to add to tokens from devs with a track record / with SOL still on
  the table (less likely to have already rugged).
- `holder_count_approx` — directional only, see caveat below.

## Data sources & caveats

- **Transactions**: Helius Enhanced Transactions API, filtered by `source`
  (`PUMP_FUN` = bonding curve, `PUMP_AMM` = pump's own post-migration AMM).
  Add `RAYDIUM` to `RELEVANT_SOURCES` in `.env` if you also want trades on
  migrated tokens that ended up on Raydium instead.
- **Token metadata / creator / migration status**: pump.fun's own frontend
  API (`frontend-api-v3.pump.fun`). This is unofficial — pump.fun can change
  or rate-limit it without notice. If `getCoin` / `getDevTokensCreatedCount`
  in `src/pumpfunApi.ts` start failing, check pump.fun's site in a browser
  Network tab for the current endpoint shape and update the URL there.
- **Volume / liquidity / price change**: Dexscreener's free public API, no
  key needed. Brand-new bonding-curve-only tokens may not be indexed yet —
  those fields just come back blank, which is expected.
- **Holder count**: approximate, via Helius's `getTokenAccounts` DAS method,
  capped at `HOLDER_LOOKUP_MAX_PAGES` pages (~1000 accounts/page) to control
  RPC cost. It counts token *accounts*, not unique owners, so treat it as
  directional. Set `HOLDER_LOOKUP_MAX_PAGES=0` to skip it entirely if you'd
  rather not spend the RPC credits.
- **Dev wallet SOL balance**: live balance at the time of his trade, straight
  RPC `getBalance`.

## Backfilling history

If you want his last N days of trades before the tracker was running, you
can seed `state/state.json` with `lastProcessedSignature: null` deleted and
instead call `fetchTransactionsPage` in a loop with `before` until you hit
your desired date range, running each through `detectTrade` +
`enrichTrade` the same way `index.ts` does. I didn't wire this up as a CLI
flag because your bigger interest is the *live* re-entry trigger, but it's a
~20-line script reusing the existing modules if you want it — say the word
and I'll add it as `src/backfill.ts`.

## Analyzing the CSV

Once you've got a few days of data, the actual pattern-mining is easiest in
pandas — group by `mint`, look at rows where `entry_number == 2`, and
correlate `seconds_since_prev_entry` against the token's `price_change_*` /
`volume_*` columns at that moment. Happy to help write that analysis script
once you've got real rows to point it at — right now every enrichment field
is only as good as pump.fun's/Dexscreener's live data, so there's nothing to
mine yet.
