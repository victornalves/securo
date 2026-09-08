# T2 — `lib/asset-detail-utils.ts` and its tests

| Field      | Value |
| ---------- | ----- |
| Task       | T2    |
| Feature    | 008   |
| Status     | Done  |
| Depends on | —     |
| PR         |       |
| Jira       |       |

## Description

Add the pure module every later task derives from, with a colocated test file. This is the
only tested surface of the feature — the repo has no component tests, and every existing
frontend test targets a pure module in `lib/` or the locale files.

## Implementation guidance

From `plan.md` → *Data Model / Contracts* and the ADRs on running position, bought/sold
aggregates, the cost series, and external links.

```ts
// Signed running quantity after each trade, keyed by transaction id.
// Sorted by date; the final value must equal Asset.units.
export function runningPositions(txs: AssetTransaction[]): Map<string, number>

// Fee-inclusive aggregates matching _recompute's convention:
// a fee raises what a buy cost and lowers what a sell returned.
export function boughtSoldTotals(txs: AssetTransaction[]): {
  bought: number; sold: number; buyCount: number; sellCount: number
}

// Cumulative cost aligned to the trend's dates. null when there are no trades,
// so the chart omits the series instead of drawing it flat at zero.
export function cumulativeCostSeries(
  trend: { date: string; amount: number }[],
  txs: AssetTransaction[],
): { date: string; cost: number }[] | null

// Filterable ⊃ externally linkable. A TD: symbol is the first but not the second.
export function hasFilterableTicker(asset: Asset): boolean
export function externalLinksFor(asset: Asset): { provider: 'yahoo' | 'tradingview' | 'google'; url: string }[]
```

**`runningPositions`** — sort by `date`, accumulate `+quantity` on a buy and `-quantity` on a
sell. The backend (`_recompute`, `_detect_oversell`) sorts by `(date, created_at)`, but
`AssetTransactionRead` does **not** expose `created_at`, so the client can only sort by date.
Within a single date the order may differ from the backend's. This affects only intermediate
values, never the final position and never a monetary figure — say so in the docstring.

**`boughtSoldTotals`** — `bought = Σ(q*p + fee)` over buys, `sold = Σ(q*p − fee)` over sells.
This mirrors `_recompute`: `cost += q*p + fee` on a buy, `realized += (p−avg)*q − fee` on a
sell.

**`cumulativeCostSeries`** — walk the trend's dates in order; for each date, sum the net cost
of all trades up to and including it. Buys add `q*p + fee`; sells subtract the average cost of
the units sold. Return `null` for an empty ledger. The average-cost subtraction is deliberate
and was settled at plan approval (plan v1.0.0); the cumulative-net-cash alternative is
recorded in the ADR but is not the chosen path.

**Two predicates, never conflated** — this is the trap the spec calls out explicitly:

- `hasFilterableTicker(asset)` → `!!asset.ticker`. Used by T12's filter. A Tesouro Direto
  asset **passes** this.
- `externalLinksFor(asset)` → `[]` unless `valuation_method === 'market_price'` **and**
  `asset.ticker` is set **and** the ticker is not `TD:`-prefixed. A Tesouro Direto asset
  **fails** this.

URL shapes (the ticker is a `yfinance` symbol, so Yahoo takes it verbatim):

- Yahoo — `https://finance.yahoo.com/quote/{ticker}`
- TradingView — `https://www.tradingview.com/symbols/{ticker with market suffix stripped}/`
- Google — `https://www.google.com/search?q={encodeURIComponent(ticker + ' ' + name)}`

## Files affected

- `frontend/src/lib/asset-detail-utils.ts` (new)
- `frontend/src/lib/asset-detail-utils.test.ts` (new)

## Done when

Covers the spec's *Quality* criterion on automated tests, and pre-satisfies the arithmetic
behind the *Bought vs. sold comparison*, *Chart* and *External links* criteria. The test file
implements the unit table in `plan.md` → *Test Strategy*:

- buy → buy → partial sell: per-trade running position, and final value equals `units`
- `boughtSoldTotals` with non-zero fees
- empty ledger → zero counts, and `cumulativeCostSeries` → `null`
- `cumulativeCostSeries` against a hand-computed ledger spanning several trend dates, with a sale
- `externalLinksFor` on a US equity, a `.SA` equity, a `-USD` crypto pair
- `externalLinksFor` on manual, growth-rule, tickerless and `TD:` assets → `[]`
- `hasFilterableTicker` on a `TD:` asset → `true` while `externalLinksFor` on it → `[]`
- TradingView suffix stripping; Google query encoding of a name with spaces and punctuation

## Notes

Follow the style of `lib/drill-down-utils.ts`: a module docstring explaining why the logic
lives outside the component, and a pointer back to `planning/008-asset-detail-drawer`.

## Outcome

`lib/asset-detail-utils.ts` with `runningPositions`, `boughtSoldTotals`,
`cumulativeCostSeries`, `hasFilterableTicker` and `externalLinksFor`; 23 tests in
`lib/asset-detail-utils.test.ts`, suite now 106/106.

Two things the tests pin down beyond the task's list:

- `runningPositions` is asserted to give the same result when the ledger arrives newest-first,
  which is how the API serves it — the replay must not inherit the caller's ordering.
- `cumulativeCostSeries` clamps a sale that would take the position negative, mirroring
  `_recompute`'s own defensive clamp. The backend rejects an oversell, so this can only arise
  from inconsistent data, but the series should not go negative if it does.

The `.SA`-stripping regex is anchored to 2-4 uppercase letters after a dot, so `BTC-USD` keeps
its pair suffix on TradingView while `PETR4.SA` loses its market suffix — covered by a test
each, since a naive "strip everything after the last separator" would have broken crypto.
