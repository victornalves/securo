# Spec: Asset detail drawer

| Field        | Value        |
| ------------ | ------------ |
| ID           | 008          |
| Type         | Feature      |
| Status       | Approved     |
| Version      | 1.0.0        |
| Author       | Victor Alves |
| Last updated | 2026-09-08   |
| Jira         | —            |
| Confluence   | —            |

## Context & Problem

`/assets` presents the portfolio as wallets (`AssetGroup`) containing holdings (`Asset`), plus a
second tab holding the buy/sell ledger. Clicking a holding row expands it inline
(`renderHoldingRow`, `frontend/src/pages/assets.tsx`), and what appears depends on
`valuation_method`:

- `market_price` → a value-evolution chart (`AssetDetail` in `chartOnly` mode) followed by
  `HoldingLedger`, the per-asset list of trades.
- `manual` / `growth_rule` → an "Add value" form and the `AssetValue` history.

Three problems compound in that surface.

**1. Selling is not discoverable.** The data model has supported both directions since issue #235:
`AssetTransaction.kind` is `'buy' | 'sell'`, `AddHoldingTransactionDialog` carries a two-option
Type toggle, and `asset_transaction_service` validates sells against the held quantity. But nothing
on the holdings table says "sell". The only inline affordance is `+ add buys`, rendered in the
average-price cell **and only when `average_price == null`** — so it disappears for exactly the
holdings a user is most likely to sell, the ones with a recorded cost. Reaching a sell today means
expanding the row, finding "Add transaction", and discovering the Type toggle inside the dialog.
Buy is a link on the table; sell is three interactions deep behind a control that does not name it.

**2. "Add value" is mistaken for a transaction.** For a `manual` asset, the inline form calls
`assets.addValue` → `POST /assets/{id}/values`, which stores an `AssetValue`: an **absolute
revaluation** ("this is worth X as of this date"), not a delta and not a trade. The input is
`type="number" step="any"` with no `min`, so a negative amount is accepted and makes the asset worth
a negative amount — it does not record a disposal. Two unrelated concepts, a *valuation* and a
*trade*, currently share the word "value" and the same click target, and the UI never distinguishes
them. A user reasoning "a negative value must be a sale" is reasoning correctly from what the screen
shows, and is wrong.

**3. Per-asset trade history is hard to reach and the global one cannot be narrowed.** The inline
`HoldingLedger` does list a single asset's trades, but only inside an expanded table row competing
for width with eight columns, and it shows a bare list — no position summary, no running quantity,
no way to see buys separately from sells. The `Transactions` tab lists **every** trade across the
whole portfolio with **no filter at all**: `AssetTransactionsTab` calls `assets.allTransactions()`
with no arguments and renders the result straight through. The API already accepts `ticker` and
`kind` query parameters (`allTransactions(params?: { ticker?, kind? })` → `GET
/assets/transactions`); the UI simply never sends them. So the tab that exists to answer "what
happened with this asset?" is the one place you cannot ask about one asset.

The consequence is that a holding is legible as a *number* — quantity, average price, return — but
not as a *history*. The figures behind it (`average_price`, `total_invested`, `realized_gain`,
`gain_loss`) are all already computed server-side and returned on `AssetRead`, and the ledger that
produced them is already fetchable per asset. Nothing is missing from the data; what is missing is
a surface that puts them together.

Elsewhere in the app that surface is a right-side drawer. `TransactionDrillDown` (spec 006)
establishes the pattern: backdrop, panel pinned right, Escape and click-outside to dismiss, header
with the subject and a close button, a scrolling body, a summarizing footer. This spec applies that
established pattern to a holding.

**This is a frontend-only change, and that was verified rather than assumed.** Every figure and
series the drawer needs is already served: `GET /assets/{id}/transactions`,
`GET /assets/{id}/value-trend`, `GET /assets/{id}/values`, and the `Asset` payload itself (`units`,
`average_price`, `total_invested`, `realized_gain`, `gain_loss`, `last_price`, `last_price_at`,
`transaction_count`, `purchase_price`, `purchase_date`, `sell_date`, `currency`, `ticker`,
`ticker_exchange`, `logo_url`). The global tab's filters need only to start passing parameters the
endpoint already accepts. No new endpoint, no schema change, no migration.

## Goals

- Make recording a **sale** as reachable and as obvious as recording a **purchase**, from the
  holdings table, without the user having to know the two are the same control.
- Give each holding one detail surface that answers "what is this asset, and what did I do with
  it?" — position, history, and the relationship between what was invested and what it is worth.
- Separate *valuation* from *trade* in the interface, so a manual asset's revaluation is never read
  as a purchase or a sale.
- Let a user narrow trade history to one asset and one direction, both in the per-asset view and in
  the global `Transactions` tab.
- Give the user a path to third-party information about a market-traded holding, without Securo
  fetching, storing, or implying ownership of that information.

## Non-Goals

- Any backend change: no new endpoint, no change to an existing response shape, no change to how
  `average_price`, `realized_gain`, `total_invested` or `gain_loss` are computed, and no migration.
  If the work turns out to need one, this spec is wrong and gets revised rather than stretched.
- Enabling the buy/sell ledger on `manual` and `growth_rule` assets. `add_transaction` would accept
  it — it does not check `valuation_method` — but `recompute_and_cache` then overwrites `units`,
  `average_price`, `purchase_price` and `purchase_date` from the replayed ledger, and for a
  non-market asset it also skips `_apply_price_to_asset`. That collision with the manual valuation
  flow is a backend question, not a frontend one (see Open Questions).
- Recomputing cost basis, average price, or realized gain in the browser.
  `asset_transaction_service._recompute` is the single authority: weighted-average cost, fees added
  to cost on a buy and subtracted from realized gain on a sell, oversell clamped defensively. A
  second implementation in TypeScript would drift from it silently.
- Per-trade realized P&L. It is not stored and not returned; deriving it client-side means
  reimplementing the average-cost replay, which the point above rules out. Realized gain is shown at
  the asset level, as the backend reports it.
- Fetching, caching, or displaying any third-party market data, indicator, news item, or logo beyond
  what `market/quote` and `logo_url` already provide. External providers are linked to, never read.
- Changing the wallets/holdings table itself: columns, grid template, sort order, wallet totals,
  collapse state, and the move/edit/delete row actions all stay as they are.
- Changing `/transactions` (the cash-transaction view). This spec touches only the asset trade
  ledger under `/assets`.
- Multi-currency conversion work. The drawer reports each figure in the currency the backend already
  reports it in, with the existing `current_value_primary` secondary line where it exists today.
- Bulk actions, CSV export, or importing trades.

## User Stories / Use Cases

- As a user who sold part of a position, I want a **Sell** action visible on the holding itself, so
  that I don't conclude Securo only tracks purchases.
- As a user looking at a holding, I want its trades, its position, and its value history in one
  place, so that I can understand the asset without cross-referencing a global list.
- As a user reviewing a long ledger, I want to see the quantity I held **after** each trade, so that
  the list reads as a history of the position rather than a pile of receipts.
- As a user with an unrealized gain, I want to see how far the market value has moved from what I
  actually put in, so that the return percentage means something concrete.
- As a user of a manual asset (an apartment, a car), I want the interface to tell me I am recording
  **what it is worth now**, so that I stop looking for a sell button that shouldn't exist there.
- As a user in the `Transactions` tab, I want to filter by asset and by buy/sell, so that a
  portfolio-wide list stays usable once it has hundreds of rows.
- As a user evaluating whether to hold or sell, I want a link out to a market data provider, so that
  I can check indicators Securo doesn't track without retyping the ticker.

## Acceptance Criteria

**Opening and dismissing**

- [ ] Clicking a holding row in any wallet opens the asset detail drawer for that asset. The inline
      row expansion is removed: no holding renders `AssetDetail` or `HoldingLedger` inside the table
      anymore, and the chevron affordance reflects whatever the row now does.
- [ ] The drawer dismisses on Escape, on a click outside the panel, and on its close button —
      matching `TransactionDrillDown`'s behavior, including the delay that keeps the opening click
      from closing it immediately.
- [ ] Row-level actions (move to wallet, edit, delete) still work from the table and do **not** open
      the drawer.
- [ ] Opening the drawer for one asset and then another shows the second asset's data, with no
      figures or list rows carried over from the first.
- [ ] Every monetary and quantity figure in the drawer is passed through the privacy-mode `mask()`,
      as the holdings table and inline ledger already do.

**URL addressability**

- [ ] Opening a holding's drawer puts the asset in the URL; reloading that URL reopens the same
      drawer over the holdings table.
- [ ] The browser back button closes an open drawer and returns to the plain holdings view, rather
      than leaving `/assets` entirely.
- [ ] A URL naming an asset that does not exist, is not visible to the current workspace, or is
      archived resolves to the plain holdings view without an error state or an empty drawer.
- [ ] Opening the drawer does not add a history entry per asset switch in a way that makes the back
      button walk backwards through every holding the user glanced at.
- [ ] The URL parameter composes with the existing page state — active tab, wallet collapse state,
      and the collection filter — without resetting any of it.

**Buy and sell parity**

- [ ] The drawer offers two distinct, separately labelled primary actions — record a purchase and
      record a sale — neither of which requires the user to change a type control to reach the
      other.
- [ ] The sale action is unavailable, with a stated reason, when the holding has no units to sell.
      This mirrors the backend rule (`_raise_if_oversell`: no short positions) instead of letting
      the user discover it as a request failure.
- [ ] Choosing either action opens the transaction form pre-set to that direction, and saving
      records a transaction of that `kind`.
- [ ] The existing oversell warning still appears when the entered quantity exceeds the units held.
- [ ] After a successful save or delete, the drawer's position summary, comparison, chart and list
      all reflect the change, and so does the holding's row in the table behind it. No manual
      refresh, no stale figure in either surface.
- [ ] A holding whose asset is provider-owned (synced, not market-priced) exposes no write action in
      the drawer, consistent with the table's `syncedReadOnly` treatment.
- [ ] Users without write permission see the drawer with no write affordances at all.

**Position summary**

- [ ] The drawer states, for a ledger-backed holding: quantity held, average price, current price
      with its freshness, current total value, unrealized return in both absolute and percentage
      terms, realized gain, total invested, and share of portfolio.
- [ ] Every one of those figures comes from the API payload. No figure in the drawer is the result
      of a client-side cost-basis, average-price, or realized-gain calculation.
- [ ] A holding with no recorded cost (`average_price == null`) shows the same "no cost" condition
      the table flags today, and offers the purchase action as the way to resolve it, rather than
      rendering an empty or zeroed return.
- [ ] A fully exited holding (`sell_date` set, zero units) is presented as closed: realized gain is
      the headline figure and the sale action is unavailable.

**Bought vs. sold comparison**

- [ ] The drawer shows total bought (sum of buy quantity × price, plus fees), total sold (sum of
      sell quantity × price, less fees), and the current market value of the remaining position, as
      three figures a user can compare directly.
- [ ] These three aggregates are computed from the asset's own transaction list and are consistent
      with the fee convention `_recompute` uses — fees increase what a purchase cost and decrease
      what a sale returned.
- [ ] The comparison is omitted, not shown as zeros, for a holding with no trades.

**Chart**

- [ ] The drawer's chart plots market value over time, with buy and sell markers on the dates they
      occurred, preserving the tooltip that already names each trade's direction, quantity and
      price.
- [ ] A second series plots cumulative cost over time, so the gap between the two lines is the
      unrealized gain at any point on the chart.
- [ ] The two series are labelled and distinguishable, and the chart is readable in both light and
      dark themes.
- [ ] The chart is omitted when there are fewer than two value points, as `chartOnly` mode already
      does, and its absence does not leave a gap or an empty frame in the drawer.
- [ ] The cost series is absent, rather than drawn flat at zero, for a holding with no trades.

**Per-asset trade list**

- [ ] The drawer lists that asset's trades newest-first, each showing direction, date, quantity,
      unit price, total, and fee when non-zero.
- [ ] Each row shows the quantity held **after** that trade, derived by replaying the asset's own
      trades in the same order the backend uses (date, then creation time). The most recent row's
      value equals the holding's `units`.
- [ ] The list can be narrowed to purchases only or sales only, and the active filter states how
      many rows it matches.
- [ ] A trade's note is visible in the list when set, and the transaction form lets the user write
      one. `notes` is already accepted by `addTransaction` and `updateTransaction` and already
      present on `AssetTransaction`.
- [ ] A trade can be edited and deleted from the drawer, with the existing delete confirmation
      wording about recalculating the average price.
- [ ] Totals shown for a trade are consistent with the transaction form's own "Total" line — the
      same word does not name two different numbers depending on where it appears.
- [ ] An empty ledger shows an empty state that offers the purchase action, not a bare "no data".

**Manual and growth-rule assets**

- [ ] Opening the drawer for a `manual` or `growth_rule` asset shows valuation history, not a trade
      ledger, and offers no purchase or sale action.
- [ ] The revaluation control names what it does — recording what the asset is worth on a date —
      distinctly enough that it is not read as recording a purchase.
- [ ] A negative revaluation amount is rejected in the UI, with a message that says a disposal is
      not what this control records.
- [ ] Existing behavior is preserved: `growth_rule` assets remain read-only with respect to manual
      valuations, and a `manual` asset's own manual entries stay deletable while rule- and
      sync-sourced entries do not.
- [ ] The valuation list keeps the purchase entry and the per-entry change-from-previous figures it
      shows today.

**External links**

- [ ] For a holding with a usable market ticker, the drawer offers links to Yahoo Finance, Google
      Search and TradingView, each opening in a new tab.
- [ ] Every link is constructed from the stored `ticker` alone. No exchange-code mapping table is
      introduced, no request is made to any third party from Securo, and no third-party response is
      read, parsed, or displayed.
- [ ] The Yahoo Finance link resolves to the correct instrument for a US equity, a B3 equity
      (`.SA`), a Brazilian fund/FII, and a crypto pair (`-USD`), without transforming the symbol.
- [ ] The TradingView link strips the Yahoo market suffix from the symbol; the Google Search link
      combines ticker and asset name.
- [ ] Every external link carries `rel="noreferrer"` and `target="_blank"`, as the existing external
      links in the codebase do.
- [ ] No link is offered where the ticker cannot identify a publicly traded instrument: manual
      assets, growth-rule assets, and `TD:`-prefixed Tesouro Direto symbols — a synthetic identifier
      that is meaningless outside Securo.
- [ ] The links are visibly external and visibly third-party, so a user cannot mistake the
      destination for a Securo screen.

**Global Transactions tab**

- [ ] The tab can be filtered by asset and by direction (purchase / sale), and the two filters
      compose.
- [ ] The filters use the `ticker` and `kind` parameters `GET /assets/transactions` already accepts,
      rather than filtering a full list in the browser.
- [ ] The asset filter is keyed on the stored `ticker` and covers every asset present in the ledger,
      Tesouro Direto bonds included — a `TD:` symbol is not externally linkable but is a valid
      filter key.
- [ ] If a tickerless asset carries trades, it is not reachable through the asset filter and the UI
      does not pretend otherwise: the filter never presents an option that returns nothing.
- [ ] The active filters are visible, individually clearable, and reflected in the empty state, so a
      filtered-to-nothing list is never mistaken for an empty ledger.
- [ ] A row in the tab leads to that asset's drawer, so the global list is a way into the per-asset
      view rather than a dead end.
- [ ] The tab's existing behavior is preserved: the amber no-cost warning cards, add/edit/delete of
      any trade, and adding a buy against a brand-new ticker via `assets.buy`.

**Quality**

- [ ] Every new user-facing string exists in all nine locale files shipped in the repo. The i18n
      parity test (`frontend/src/locales/i18n.test.ts`) passes.
- [ ] Automated tests cover, at minimum: the running-position replay against a known ledger
      including a partial sale, the bought/sold/current aggregates including fees, the external-link
      URL construction and its exclusions, and the sale action's unavailability at zero units.
- [ ] No new component fetches data the drawer's parent already has in hand; React Query keys for
      per-asset trades stay compatible with the existing `['asset-transactions', assetId]` /
      `['asset-transactions']` pair so that a mutation in one surface refreshes the other.
- [ ] Existing `/assets` tests, lint, and typecheck pass.

## Constraints & Dependencies

**Decisions locked before planning** (rationale belongs in `plan.md`):

| #  | Decision |
| -- | -------- |
| D1 | The drawer **replaces** the inline row expansion. One detail surface per holding, not two: keeping both would mean maintaining the chart and the ledger in two layouts and would leave the user two different answers to the same click. |
| D2 | `manual` and `growth_rule` assets **get the drawer**, with a valuation-history body instead of a ledger, and with no buy/sell action. The drawer becomes the single answer to "what is this holding?" for every asset type, while the *content* stays honest about the fact that a revaluation is not a trade. Extending the ledger to those types is explicitly deferred (Open Questions). |
| D3 | The drawer shows **two distinct primary actions** for a ledger-backed holding — purchase and sale — rather than one action plus a type toggle inside the form. The toggle stays in the form for editing an existing trade; it is no longer the only way to *discover* that selling exists. |
| D4 | The chart is **market value plus cumulative cost**, over the existing value-trend series, with the existing trade markers. The gap between the two lines is the unrealized gain, which turns the return percentage into something the user can see. Cumulative cost is derived from the asset's own ledger in the client — it is a running sum of stored figures, not a re-derivation of average cost. |
| D5 | Per-asset figures are **read from the API, never recomputed**. `_recompute` is the single authority on cost basis, average price and realized gain. The only client-side derivations permitted are ones that cannot diverge from it: a running quantity (sum of signed quantities) and the bought/sold aggregates (sums of stored `quantity`, `price`, `fee`). |
| D6 | External providers are **linked, never read**. Securo constructs a URL from the ticker and hands the user off. No fetch, no key, no parsing, no caching, no third-party figure rendered inside Securo. |
| D7 | The global `Transactions` tab **gains filters in this spec** rather than in a follow-up. It is the same defect as the drawer's — trade history that cannot be narrowed — and the endpoint already accepts the parameters, so splitting it would mean shipping the per-asset fix while the portfolio-wide list stays unusable. |
| D8 | Filtering on the global tab is **server-side**, via the existing `ticker` and `kind` parameters. Filtering a fully-fetched list in the browser would work today and fail at the first user with a long ledger. |
| D9 | **No backend change.** This is a scope boundary, not a prediction: if a requirement here cannot be met from the existing endpoints and payloads, the spec is revised and the requirement is re-scoped, not quietly satisfied with an API change. |
| D10 | The external destinations are **Yahoo Finance**, **Google Search**, and **TradingView** — three URLs that are constructible from the stored ticker alone, with no exchange-code mapping table. Yahoo is the exact-match link: quotes come from `yfinance`, so `Asset.ticker` *is* a Yahoo symbol (`AAPL`, `PETR4.SA`, `HGLG11.SA`, `BTC-USD`) and needs no translation. Google Search is the universal one — it cannot 404, and Google's own finance card renders at the top of the results. TradingView covers charts and indicators, using the symbol with the Yahoo market suffix stripped. **Google Finance deep links are rejected**: `/finance/quote/{SYMBOL}:{EXCHANGE}` requires Google's own exchange codes (`BVMF`, `NASDAQ`), while `ticker_exchange` holds Yahoo's display strings (`exchDisp` / `exchange`, e.g. `NasdaqGS`, `São Paulo`) — any mapping between the two would be a permanent source of silent 404s, and Google Search serves the same intent with no mapping at all. |
| D11 | The same three destinations serve **equities, ETFs and funds/FIIs** — the portfolio's actual composition — with no per-type provider set. Crypto needs no fourth provider either: Yahoo resolves `BTC-USD` and TradingView resolves crypto symbols directly. A crypto-native source (CoinGecko, on-chain supply data) is deliberately not added, because those are addressed by slug (`bitcoin`), not by ticker, and would reintroduce exactly the mapping table D10 rejects. |
| D12 | The global tab's asset filter is **scoped to the stored `ticker`**, and an asset without one is not reachable through it. This costs nothing in practice: every asset that enters the ledger through Securo's own flows is market-priced and carries a ticker, including Tesouro Direto bonds — `TD:<hash>:<maturity>` is a synthetic symbol, meaningless outside Securo but a perfectly good filter key inside it. So TD bonds are **filterable** (D12) and **not externally linkable** (D10); those are two different properties of the same string and the code must not conflate them. |
| D13 | The drawer is **addressable by URL** (`?asset=<id>`), so it survives a reload and responds to the back button. This diverges from `TransactionDrillDown`, deliberately: a holding is a durable object worth linking to, while a drill-down is a transient decomposition of a chart slice. The divergence is a considered difference between two kinds of drawer, not an inconsistency to be reconciled later. |

**Existing behavior this must not break:**

- `AddHoldingTransactionDialog` is used from two places today: the table's `+ add buys` link and the
  inline ledger's add button. Removing the inline ledger (D1) removes one caller; the other must
  keep working or move deliberately.
- `AssetDetail` serves two modes. `chartOnly` renders just the value chart (used above the inline
  ledger for market-priced holdings); the full mode renders the manual value form and the valuation
  history. Both modes are consumed by the row expansion this spec removes, so both need a new home
  in the drawer rather than deletion.
- The value chart already carries trade markers via `renderAssetTradeDot` and a tooltip that names
  each trade. It shares the `['asset-transactions', assetId]` query cache with the ledger — a fact
  the drawer's cache design has to preserve, or the markers and the list will disagree after a
  mutation.
- `refetchAssetViews` is the page's existing invalidation path after a ledger mutation
  (`assets`, `asset-transactions`, portfolio trend, dashboard). The drawer's mutations must go
  through the same path; the holdings table, wallet totals, the portfolio chart and the dashboard all
  read figures the ledger changes.
- The holdings table special-cases `TD:`-prefixed tickers as non-tickers for display. Any
  ticker-driven feature — external links, the global filter — inherits that rule.
- A trade's stored `price` is a unit price, and `fee` is separate. The inline ledger displays
  `quantity × price` while the form's "Total" adds the fee. Whichever convention the drawer adopts,
  it has to be one convention.
- `recompute_and_cache` can flip `sell_date` in both directions: a full exit marks the asset sold and
  drops it out of the active portfolio, and a later buy clears the marker. A sale recorded from the
  drawer can therefore make the holding disappear from the wallet it was opened from.
- Nine locale files are kept at key parity by an automated test. Any string added in one is added in
  all nine.
- Privacy mode (`usePrivacyMode`) masks figures across `/assets`. A new surface full of unmasked
  numbers would be a regression, not an omission.

## Open Questions

- ~~Should the drawer be addressable by URL (e.g. `?asset=<id>`)?~~ **Resolved at approval: yes** —
  D13. The divergence from `TransactionDrillDown` is accepted as a real difference between the two
  kinds of drawer, and the criteria under *URL addressability* pin down the history-entry and
  invalid-asset behavior that make it more than a cosmetic parameter.
- ~~Which market-data providers should the external links point to, and does the set depend on asset
  type?~~ **Resolved at approval: Yahoo Finance, Google Search, TradingView, one set for all types**
  — D10 and D11. The deciding constraint was found in the code rather than chosen: quotes come from
  `yfinance`, so the stored ticker is already a Yahoo symbol and Yahoo needs no translation, while
  Google Finance would need Google's exchange codes that Securo does not have. No crypto-specific
  provider is added.
- ~~Is a ticker-scoped asset filter on the global tab acceptable?~~ **Resolved at approval: yes** —
  D12, and the limitation turns out to be nearly vacuous, since every asset that enters the ledger
  through Securo's flows carries a ticker. The one thing this must not do is reuse the "has a usable
  ticker" test that governs external links: Tesouro Direto bonds fail that test and must still be
  filterable.
- Should the ledger be extended to `manual` assets, so an apartment can record a purchase and a
  sale rather than a series of revaluations? Deliberately out of scope here (D2, Non-Goals) because
  `recompute_and_cache` would overwrite `purchase_price`, `purchase_date`, `units` and
  `average_price` from the ledger while skipping the price application that market assets get.
  **Logged as backlog item 009** — it needs a backend investigation this frontend-only spec cannot
  carry.
- How wide should the drawer be? `TransactionDrillDown` uses `max-w-md`, which is comfortable for a
  single list and tight for a summary, a chart, a comparison, and a filtered list. Presentation-level
  — resolved during planning.
- Should a holding's drawer link to the cash transactions that funded the trades, where such a link
  exists? Probably a separate concern, but worth recording before it is forgotten.

## Revision History

| Version | Date       | Author       | Change        |
| ------- | ---------- | ------------ | ------------- |
| 1.0.0   | 2026-09-08 | Victor Alves | Approved. Three open questions closed into decisions: external destinations are Yahoo Finance, Google Search and TradingView with one set for every asset type (D10, D11 — Google Finance deep links rejected because they need exchange codes Securo does not hold, and no crypto-specific provider is added), the global tab's asset filter is ticker-scoped (D12 — which still covers Tesouro Direto bonds, whose synthetic `TD:` symbol is a valid filter key but not an externally linkable one), and the drawer is URL-addressable (D13 — a considered divergence from `TransactionDrillDown`). Extending the ledger to manual assets moves to backlog item 009. Drawer width and the cash-transaction link stay open as presentation-level questions for planning. |
| 0.1.0   | 2026-09-08 | Victor Alves | Initial draft. Nine decisions locked up front: drawer replaces the inline expansion (D1), manual assets get a valuation-history body and no ledger (D2), separate buy and sell actions (D3), market-value-plus-cumulative-cost chart (D4), no client-side cost-basis math (D5), external providers linked and never read (D6), global tab filters in scope (D7) and server-side (D8), no backend change (D9). |
