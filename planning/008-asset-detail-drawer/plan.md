# Plan: Asset detail drawer

| Field        | Value      |
| ------------ | ---------- |
| ID           | 008        |
| Status       | Approved   |
| Version      | 1.1.0      |
| Spec         | ./spec.md  |
| Last updated | 2026-09-08 |

## Solution Overview

One new drawer component replaces the inline row expansion on `/assets`, and the two components
that expansion used (`AssetDetail`, `HoldingLedger`) move inside it rather than being rewritten.
The drawer has two bodies selected by `valuation_method`: a **ledger body** for `market_price`
holdings (position summary, bought-vs-sold comparison, dual-series chart, filterable trade list,
buy and sell actions) and a **valuation body** for `manual` / `growth_rule` assets (valuation
history and a revaluation control that names itself as such).

Everything the drawer computes lands in a new `lib/asset-detail-utils.ts` with a colocated test
file — the project's established shape for testable frontend logic (`drill-down-utils`,
`budget-report-utils`, `rule-match-utils`, `selection-utils`), and the only shape that gets test
coverage here, since the repo has no component tests. The four derivations that go there are
deliberately the only ones permitted by spec D5: running position, bought/sold aggregates,
cumulative-cost series, and external-link URL construction. All of them are sums or string
concatenation over stored fields; none reimplements average cost.

`AssetsPage` gains a `?asset=<id>` URL parameter via `useSearchParams`, following the
push-vs-replace discipline `reports.tsx` already worked out, and passes the resolved `Asset` object
into the drawer as a prop. The page already holds the full asset list under the `['assets']` query
key, so the drawer costs no additional asset fetch. The global `Transactions` tab starts passing
the `ticker` and `kind` parameters `GET /assets/transactions` already accepts.

No backend file is touched.

## Architecture & Components

```
pages/assets.tsx  (AssetsPage)
  │
  ├── ?asset=<id>  ──►  useSearchParams  ──►  resolve against assetsList (collection-filtered)
  │                                                    │
  ├── holdings table ── row click ────────────────────► │
  │     renderHoldingRow: expansion REMOVED             │
  │     (chevron → opens drawer; row actions unchanged)  ▼
  │                                         components/assets/AssetDetailDrawer.tsx   [NEW]
  │                                            │
  │                                            ├── header: icon · ticker · name · badges
  │                                            │           · ExternalLinksMenu           [NEW]
  │                                            │
  │                                            ├── valuation_method === 'market_price'
  │                                            │     ├── PositionSummary                [NEW]
  │                                            │     ├── BoughtSoldBar                  [NEW]
  │                                            │     ├── AssetDetail (chartOnly)      [MOVED]
  │                                            │     │     + cumulative-cost series   [EXTENDED]
  │                                            │     └── HoldingLedger                [MOVED]
  │                                            │           + kind filter, running position,
  │                                            │             notes, edit action        [EXTENDED]
  │                                            │
  │                                            └── otherwise
  │                                                  └── AssetDetail (full)           [MOVED]
  │                                                        + revaluation wording,
  │                                                          negative guard            [EXTENDED]
  │
  └── AssetTransactionsTab  ── ticker + kind filters ──► GET /assets/transactions   [EXTENDED]
                                  row click ───────────► ?asset=<id>

lib/asset-detail-utils.ts        [NEW]  pure: replay, aggregates, cost series, link URLs
lib/asset-detail-utils.test.ts   [NEW]
```

**Component boundaries.** `AssetDetailDrawer` owns the panel shell, dismissal, and body selection.
It receives the `Asset` and the page's `portfolioTotalPrimary` as props and fetches only per-asset
series (`asset-transactions`, `asset-values`, `asset-trend`). `PositionSummary` and `BoughtSoldBar`
are presentational: they take numbers and render them, so the arithmetic stays in
`asset-detail-utils` where it is tested.

**File naming.** New components go under `components/assets/` in PascalCase, matching the existing
subfolder convention (`components/reports/BudgetReport.tsx`, `components/agents/*`) rather than the
kebab-case used at the `components/` root.

**What leaves `assets.tsx`.** `AssetDetail`, `HoldingLedger` and `AddHoldingTransactionDialog` are
currently defined inside the 2868-line `pages/assets.tsx`. They move to `components/assets/` as
part of this work — not as an optional cleanup, but because the drawer and the global tab both need
them and a page module cannot export them without becoming a component library.

## Technical Decisions (mini-ADRs)

### Decision: centralize ledger invalidation, because it is incomplete today

- **Context:** a trade mutation currently refetches `['asset-transactions']` (in the mutating
  component) and then calls `refetchAssetViews`, which covers `['assets']`, `['portfolio-trend']`
  and `['dashboard']`. **Neither path refetches `['asset-trend', assetId]` or
  `['asset-values', assetId]`.** But `recompute_and_cache` calls `_apply_price_to_asset` for
  market-priced assets, which rewrites today's `AssetValue` to match the new quantity. So a trade
  already changes the value series without the chart being told. Today that is easy to miss — the
  chart and the ledger live in a row the user is about to collapse. In the drawer they sit six
  scroll-lines apart, and the stale chart becomes obvious.
- **Decision:** one `refetchAssetLedgerViews(queryClient, assetId)` helper that refetches the full
  set — `['asset-transactions']`, `['asset-transactions', assetId]`, `['asset-values', assetId]`,
  `['asset-trend', assetId]`, `['assets']`, `['portfolio-trend']`, `['dashboard']` — and is the
  single `onSuccess` path for every trade mutation, wherever it is triggered from.
- **Alternatives considered:** *keep per-component invalidation* — this is what produced the gap;
  adding two more mutation sites (the drawer's buy and sell) would multiply the chance of another
  omission. *Invalidate everything (`queryClient.invalidateQueries()`)* — cheap to write, but it
  discards the deliberate `refetchQueries`-not-`invalidateQueries` choice documented at
  `refetchAssetViews`, which exists because the global 5-minute `staleTime` was leaving pre-edit
  data on screen.
- **Consequences:** one more refetch pair per trade than strictly necessary when the chart is not
  rendered. Accepted: correctness of a visible figure over a saved request. The existing query keys
  stay unchanged, so the holdings table and the global tab keep working through the same cache.

### Decision: select the body by `isLedgerBacked`, not by `valuation_method`

- **Context:** the plan and spec both assumed `valuation_method === 'market_price'` was a usable
  proxy for "this holding has a trade ledger". QA against the live database disproved it: all 18
  active assets are `manual` *with* trades, because `add_transaction` never checks the valuation
  method. `recompute_and_cache` then derives `units`, `average_price` and a cost-basis
  `purchase_price` from those trades, while `_apply_price_to_asset` is skipped — so the current
  value still comes from `AssetValue`. The drawer keyed on the method and therefore hid the very
  trades the feature exists to surface.
- **Decision:** `isLedgerBacked(asset)` = `transaction_count > 0 || average_price != null`, which is
  the signal `asset_service._asset_to_read` already uses and names in a comment. The drawer shows
  the ledger when `isLedgerBacked(asset) || valuation_method === 'market_price'` (the second
  disjunct so a market asset with no trades yet still has somewhere to put the purchase action), and
  the valuation body when the method is not `market_price` (its value genuinely comes from
  `AssetValue`). Both can be true; that is a hybrid, and it gets a line saying trades set the
  position while valuations set the value.
- **Alternatives considered:** *treat a hybrid as market-priced* — it has no quote, so the position
  summary would report a current price and an unrealized gain it cannot know. *Show only the ledger
  for a hybrid* — its current value comes from valuations, so removing that control would leave the
  value unmaintainable. *Migrate hybrids to `market_price`* — a backend data change, out of scope
  here and not obviously correct: these assets may deliberately have no quote.
- **Consequences:** three body compositions instead of two. `AssetDetail` takes a `hasLedger` prop,
  because it can no longer infer from `valuationMethod` whether trade markers are worth fetching.
  Backlog 009 is unaffected: it still governs whether a *tradeless* manual asset may start a ledger.

### Decision: `?asset=<id>` with the reports.tsx push-vs-replace discipline

- **Context:** spec D13 wants the drawer linkable and back-button-friendly, and the acceptance
  criteria forbid stacking a history entry per asset the user glances at. `reports.tsx` already hit
  exactly this and documented the fix: the first sync from state to URL uses `{ replace: true }`,
  subsequent user-driven changes push, and `setSearchParams` is excluded from the effect's
  dependencies because react-router-dom returns a new reference on every navigation and reacting to
  it alone pushed spurious duplicate entries.
- **Decision:** copy that discipline. Opening a drawer from a closed state pushes one entry; switching
  from one asset directly to another **replaces**; closing pops back. A `syncingFromUrlRef` guard
  prevents the URL→state and state→URL effects from fighting.
- **Alternatives considered:** *a route (`/assets/:id`)* — cleaner in principle, but `/assets` is a
  tab-bearing page with wallet collapse state and a collection filter, and a route change would
  remount it, resetting all three; the spec requires the parameter to compose with that state.
  *`replace: true` always* — the back button would then leave `/assets` entirely, which a criterion
  forbids.
- **Consequences:** two effects with a ref guard is more machinery than a `useState`. Mitigated by
  following a pattern already debugged in this codebase, and by pointing the comment at
  `reports.tsx` so the next reader finds the precedent rather than rediscovering the bug.

### Decision: resolve the URL parameter against the collection-filtered list

- **Context:** the page loads `assets.list(false)` (archived excluded) under `['assets']`, then
  narrows it to the active collection's wallets via `activeWalletIds`. The spec requires a URL
  naming a nonexistent, invisible, or archived asset to resolve to the plain holdings view, with no
  error and no empty drawer.
- **Decision:** resolve `?asset=<id>` by lookup in the already-filtered `assetsList`. A miss clears
  the parameter and renders the plain view. No fetch-by-id, no `assets.get` call.
- **Alternatives considered:** *fetch the asset by id when it is not in the list* — it would open a
  drawer for an asset the collection filter deliberately hid, making the filter leak. *Show a
  "not found" state* — the spec explicitly rules it out; a stale link should degrade to the page,
  not to an error.
- **Consequences:** while `['assets']` is loading, a URL-addressed drawer cannot resolve yet, so it
  opens on the first render after the list arrives. Handled by gating on `isLoading` rather than
  clearing the parameter, so a deep link on a cold load is not silently dropped.

### Decision: replay the ledger for running position, and assert it against `units`

- **Context:** the spec wants a "held after this trade" column, and forbids client-side cost-basis
  math (D5). A running quantity is a sum of signed quantities — it cannot diverge from
  `_recompute`'s average-cost logic, because it does not touch cost.
- **Decision:** `runningPositions(txs)` sorts by `(date, created_at)` — the same order
  `_recompute` and `_detect_oversell` use — and accumulates `+quantity` on a buy, `-quantity` on a
  sell. The test asserts the final value equals the asset's `units` for a ledger containing a
  partial sale.
- **Alternatives considered:** *ask the backend for it* — it would be a response-shape change, which
  D9 forbids. *Skip the column* — it is the thing that turns the list from receipts into a history,
  per the spec's user story.
- **Consequences:** `AssetTransaction` as returned by the API carries no `created_at`
  (`_tx_to_read` does not include it), so the client can only sort by `date`. Within a single date
  the client's order may differ from the backend's. This affects only the intermediate
  running-position values on same-day trades, never the final one and never any monetary figure.
  Recorded as a known limitation in Risks rather than papered over.

### Decision: bought/sold aggregates follow `_recompute`'s fee convention

- **Context:** `_recompute` adds the fee to what a purchase cost (`cost += q*p + fee`) and subtracts
  it from what a sale returned (`realized += (p-avg)*q - fee`). The spec requires the drawer's
  comparison to be consistent with that. Meanwhile the inline ledger row displays
  `quantity × price` with no fee while the transaction form's "Total" line adds it — the same word
  naming two numbers.
- **Decision:** `boughtSoldTotals(txs)` returns `{ bought, sold, buyCount, sellCount }` with
  `bought = Σ(q*p + fee)` over buys and `sold = Σ(q*p − fee)` over sells. The ledger row and the
  form's "Total" both adopt the fee-inclusive figure, and the row shows the fee as a separate
  secondary line as the global tab already does.
- **Alternatives considered:** *report gross figures and show fees separately* — defensible, but it
  would mean the drawer's "total bought" differs from the cost basis the backend derived from the
  same trades, reintroducing a two-numbers-one-word problem at a higher level.
- **Consequences:** the ledger row's total changes for any trade with a non-zero fee. This is a
  visible change to existing output, and it is the point: the previous number did not match the
  form that created it.

### Decision: cumulative cost as a second series on the existing chart

- **Context:** spec D4 wants the gap between market value and cumulative cost to be readable as the
  unrealized gain. The value series comes from `['asset-trend', assetId]`; trades come from
  `['asset-transactions', assetId]`, which `AssetDetail` already fetches for its markers.
- **Decision:** `cumulativeCostSeries(trendPoints, txs)` walks the trend's dates in order and, for
  each, sums the net cost of all trades up to and including that date — buys add `q*p + fee`, sells
  subtract the average cost of the units sold. It returns `null` when the ledger is empty, so the
  series is absent rather than drawn flat at zero.
- **Alternatives considered:** *plot `total_invested` as a flat line at its current value* — a
  single number stretched across time, wrong everywhere except today. *A separate chart* — doubles
  the vertical space and destroys the comparison, which only works when both series share an axis.
- **Consequences:** subtracting the average cost of sold units is the one place this plan touches
  average-cost reasoning, which D5 restricts. It is contained: the series is presentational, no
  figure in the summary derives from it, and the test pins it against a hand-computed ledger. If the
  reviewer judges this to cross D5, the fallback is to plot cumulative net cash (buys minus sales
  at transacted prices), which needs no average and answers a slightly different question. **Flagged
  for the spec's approval discussion.**

### Decision: external links from the ticker alone, with an explicit linkability test

- **Context:** the ticker is a `yfinance` symbol, so Yahoo needs no translation (spec D10). Tesouro
  Direto assets carry a synthetic `TD:<hash>:<maturity>` symbol which is a valid filter key but
  meaningless externally (spec D12).
- **Decision:** two separate predicates, never conflated:
  `hasFilterableTicker(asset)` → `!!asset.ticker`, used by the global tab's filter;
  `externalLinksFor(asset)` → `[]` unless `valuation_method === 'market_price'` **and**
  `asset.ticker` is set **and** `!isTesouroSymbol(asset.ticker)`. URL shapes:
  Yahoo `https://finance.yahoo.com/quote/{ticker}` (symbol verbatim);
  TradingView `https://www.tradingview.com/symbols/{ticker with market suffix stripped}/`;
  Google `https://www.google.com/search?q={encodeURIComponent(ticker + ' ' + name)}`.
- **Alternatives considered:** *one `isTicker`-style helper for both uses* — this is the trap the
  spec calls out: reusing the display-level "is this a real ticker?" test would drop Tesouro Direto
  bonds out of the filter for no reason.
- **Consequences:** the `TD:` prefix check duplicates a rule the backend owns
  (`tesouro_direto.is_tesouro_symbol`). Accepted — the frontend already special-cases the prefix for
  display in `renderHoldingRow`, so this centralizes an existing duplication rather than creating
  one. The suffix-stripping rule for TradingView is a heuristic and its failure mode is a search
  page instead of a chart, which is why Google Search is in the set as the link that cannot fail.

### Decision: server-side filters on the global tab, ticker-keyed

- **Context:** `allTransactions(params?: { ticker?, kind? })` already maps to
  `GET /assets/transactions`. The UI calls it with no arguments (spec D7, D8).
- **Decision:** the tab holds `{ ticker: string | null, kind: 'buy' | 'sell' | null }` in state and
  puts both in the React Query key, so a filter change is a refetch rather than a client-side
  narrowing. The asset selector is built from market holdings that have a ticker, so it never offers
  an option that returns nothing.
- **Alternatives considered:** *filter the fetched array in the browser* — works at today's data
  volume and fails at the first long ledger, and the parameters already exist.
- **Consequences:** an asset with trades but no ticker is unreachable through the filter. Accepted
  and stated in the spec; no such asset arises from Securo's own flows, since the ledger is entered
  through `assets.buy` and market holdings.

### Decision: valuation body states what it records, and rejects negatives

- **Context:** `POST /assets/{id}/values` stores an absolute revaluation. The current input is
  `type="number" step="any"` with no `min`, so a negative amount is accepted and makes the asset
  worth a negative amount. Users read it as a disposal.
- **Decision:** the drawer's valuation body labels the control as recording what the asset is worth
  on a date, adds `min="0"`, and blocks submission of a negative amount with a message saying a
  disposal is not what this control records. `growth_rule` assets keep showing history only, and
  per-entry deletion stays restricted to `source === 'manual'` entries, exactly as today.
- **Alternatives considered:** *interpret a negative amount as a sale* — it is the mental model the
  spec exists to correct, and the endpoint has no notion of a disposal. *Silently clamp to zero* —
  hides a mistake instead of naming it.
- **Consequences:** a user who was deliberately entering negative valuations (a liability modelled
  as an asset) loses that. Unlikely, and the correct fix would be a liability type, not a negative
  asset.

## Data Model / Contracts

**No schema change, no migration, no endpoint change.** Every call already exists:

| Call | Used for | New? |
| ---- | -------- | ---- |
| `assets.list(false)` → `['assets']` | the `Asset` passed into the drawer | existing, already on the page |
| `assets.transactions(id)` → `['asset-transactions', id]` | ledger list, chart markers, all derivations | existing key, shared with the chart |
| `assets.allTransactions({ ticker, kind })` | global tab | existing call, **parameters newly passed** |
| `assets.values(id)` / `assets.valueTrend(id)` | valuation body, chart | existing |
| `assets.addTransaction(id, { kind, quantity, price, fee, date, notes })` | buy and sell actions | existing; `notes` newly sent |
| `assets.updateTransaction(txId, …)` / `deleteTransaction(txId)` | edit, delete | existing |
| `assets.addValue(id, …)` / `deleteValue(valueId)` | valuation body | existing |
| `assets.buy({ ticker, … })` | global tab's new-ticker path | existing, unchanged |

**Fields read from `Asset` (all already on `AssetRead`):** `units`, `average_price`,
`total_invested`, `realized_gain`, `gain_loss`, `last_price`, `last_price_at`, `transaction_count`,
`purchase_price`, `purchase_date`, `sell_date`, `currency`, `current_value`,
`current_value_primary`, `ticker`, `ticker_exchange`, `logo_url`, `valuation_method`, `source`,
`type`, `group_id`.

**`lib/asset-detail-utils.ts` — the tested surface:**

```ts
// Signed running quantity after each trade, newest-first to match the list.
// Sorted by date (the API does not expose created_at); the final value must
// equal Asset.units.
export function runningPositions(txs: AssetTransaction[]): Map<string, number>

// Fee-inclusive aggregates, matching _recompute's convention:
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

**New i18n keys** go under the existing `assets` namespace in all nine locale files. The parity test
(`locales/i18n.test.ts`) enforces four things, in both directions: no duplicate keys at any nesting
level (it hand-parses the JSON, because `JSON.parse` silently keeps the last of a duplicate pair),
every `en.json` key present in every locale, **no key present in a locale that is absent from
`en.json`**, and identical `{{placeholder}}` sets per key across locales. So a key cannot be added
to one file only in either direction, and an interpolated string must use the same placeholder names
everywhere. Polish expands some keys into i18next plural forms (`_one`, `_few`, `_many`, …), which
the test accepts in place of the base key — worth knowing before "fixing" an apparent mismatch
there.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| A sale that closes a position flips `sell_date` server-side, dropping the holding out of the active list — the drawer's own asset vanishes from `assetsList` while it is open | High | Medium | Detect the disappearance after the refetch and close the drawer with a toast naming what happened, rather than leaving a drawer bound to a stale object or throwing on a null asset |
| Same-day trades order differently in the client than in `_recompute`, because `created_at` is not in the API response | Medium | Low | Only intermediate running-position values are affected — never the final position, never a monetary figure. Documented in the util's docstring; if it ever matters, the fix is a backend field, i.e. a new spec |
| Removing the inline expansion breaks `AddHoldingTransactionDialog`'s second caller and the `+ add buys` link | Medium | Medium | Both callers are enumerated in the spec's dependency list; the dialog moves to `components/assets/` and both the table link and the drawer's actions target it explicitly, verified by walking the two entry points |
| The 2868-line `pages/assets.tsx` makes a large diff hard to review, raising the chance of a silent regression in wallet totals or collapse state | High | Medium | Extract the three moving components in their own task, with no behavior change, before any feature work touches them |
| `cumulativeCostSeries` subtracting average cost on a sale is judged to cross spec D5 | Medium | Low | Fallback stated in the ADR: plot cumulative net cash instead, which needs no average. Decided at plan approval, not during implementation |
| A drawer wide enough for a chart and a summary looks broken on a phone | Medium | Medium | Width is responsive — full width below the `sm` breakpoint, capped above it; the ledger's own horizontal overflow follows the holdings table's existing `overflow-x-auto` treatment |
| Nine locale files drift, or a placeholder is renamed in one | Medium | Low | `locales/i18n.test.ts` already enforces key and placeholder parity; it runs in the same suite as the new util tests |

## Test Strategy

The repo has **no component tests** — every existing frontend test targets a pure module in `lib/`
or the locale files. This plan does not introduce a component-testing stack; it puts the logic worth
testing where the project already tests logic, and covers the rest by explicit manual QA.

**Unit — `lib/asset-detail-utils.test.ts` (new):**

| Test | Verifies (spec criterion) |
| ---- | ------------------------- |
| Replay a ledger of buy → buy → partial sell; assert per-trade running position and that the final value equals `units` | "each row shows the quantity held after that trade… the most recent row's value equals `units`" |
| `boughtSoldTotals` over trades with non-zero fees | "consistent with the fee convention `_recompute` uses" |
| `boughtSoldTotals` and `cumulativeCostSeries` on an empty ledger → zero-count / `null` | "omitted, not shown as zeros"; "absent, rather than drawn flat at zero" |
| `cumulativeCostSeries` against a hand-computed ledger spanning several trend dates, including a sale | dual-series chart criteria |
| `externalLinksFor` on a US equity, a `.SA` equity, a `-USD` crypto pair | "resolves to the correct instrument… without transforming the symbol" |
| `externalLinksFor` on manual, growth-rule, tickerless, and `TD:`-prefixed assets → `[]` | "no link is offered where the ticker cannot identify a publicly traded instrument" |
| `hasFilterableTicker` on a `TD:` asset → `true`, while `externalLinksFor` on it → `[]` | the spec's explicit filterable-but-not-linkable criterion |
| TradingView suffix stripping; Google query encoding of a name with spaces and punctuation | "strips the Yahoo market suffix"; "combines ticker and asset name" |

**Existing suites that must stay green:** `locales/i18n.test.ts` (nine-locale key and placeholder
parity), plus lint and typecheck.

**Manual QA — the criteria no unit test can reach:**

1. Open a holding from each wallet; confirm the inline expansion is gone and row actions (move,
   edit, delete) still do not open the drawer.
2. Dismiss via Escape, click-outside, and the close button. Confirm the opening click does not
   immediately close it.
3. Reload on `?asset=<id>`; press back; confirm back returns to the plain holdings view and not off
   `/assets`. Switch between several assets, then confirm back does not walk through each one.
4. Hand-edit the URL to a nonexistent id, an archived asset, and an asset outside the active
   collection → plain holdings view, no error, no empty drawer.
5. Record a buy and a sell from the drawer; confirm the summary, comparison, chart, list, the row
   behind the drawer, the wallet total, and the portfolio chart all update with no manual refresh.
6. Sell the entire position; confirm the drawer's close-and-explain behavior and that the holding
   moves out of the active list.
7. Open a holding with zero units → sale action unavailable with a stated reason. Enter an oversell
   quantity → existing warning still appears.
8. Open a provider-owned synced asset → no write affordances. Repeat as a read-only member.
9. Open a `manual` asset and a `growth_rule` asset → valuation body, no trade actions, negative
   amount rejected with the disposal message, `growth_rule` still read-only.
10. Toggle privacy mode with the drawer open → every figure masked.
11. Both themes, and a narrow viewport.
12. Filter the global tab by asset and by direction, compose them, clear each individually, filter
    to nothing and read the empty state, then click a row through to its drawer.

## Out of Scope (deferred implementation choices)

- Any component-testing stack. Worth doing, and a change to how the whole frontend is tested — not
  a decision this spec should make on its own.
- Further decomposition of `pages/assets.tsx` beyond the three components the drawer needs.
- Memoizing or virtualizing the trade list. The derivations are linear over one asset's trades; a
  ledger long enough to matter is a different problem.
- Reconciling `TransactionDrillDown` and `AssetDetailDrawer` into one shared panel primitive. They
  differ in width, dismissal semantics, and URL behavior (spec D13); a shared abstraction would have
  to absorb all three differences to save a `<div>`.
- Adding a `sheet.tsx` primitive to `components/ui/`. The codebase has no drawer primitive — the
  drill-down hand-rolls its panel — and introducing one is a design-system decision, not this
  spec's.

## Revision History

| Version | Date       | Author       | Change       |
| ------- | ---------- | ------------ | ------------ |
| 1.1.0   | 2026-09-08 | Victor Alves | Adds the ADR on selecting the drawer body by `isLedgerBacked` rather than `valuation_method`, after QA showed the original premise was false for the entire live portfolio. See spec 1.1.0 (D14, D15). |
| 1.0.0   | 2026-09-08 | Victor Alves | Approved as written. The flagged decision inside `cumulativeCostSeries` — subtracting average cost on a sale — is settled by this approval and stands; the cumulative-net-cash fallback stays recorded in the ADR but is not the chosen path. |
| 0.1.0   | 2026-09-08 | Victor Alves | Initial plan. Nine ADRs. Two findings from reading the code shaped it: trade mutations never refetch `asset-trend` / `asset-values` even though `_apply_price_to_asset` rewrites the value series, so invalidation is centralized; and `AssetTransaction` carries no `created_at`, so same-day running-position order is a stated limitation. One decision — average-cost subtraction inside `cumulativeCostSeries` — is flagged for the approval discussion with a stated fallback. |
