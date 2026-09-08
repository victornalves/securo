# T12 — Server-side filters on the global Transactions tab

| Field      | Value       |
| ---------- | ----------- |
| Task       | T12         |
| Feature    | 008         |
| Status     | Done        |
| Depends on | T2, T11     |
| PR         |             |
| Jira       |             |

## Description

Give the portfolio-wide trade ledger the filters it has never had, and make a row in it a way
into that asset's drawer.

## Implementation guidance

From spec decisions D7, D8, D12 and `plan.md` → ADR *server-side filters on the global tab,
ticker-keyed*.

**Today** `AssetTransactionsTab` calls `assets.allTransactions()` with **no arguments** and
renders the result straight through — so the tab that exists to answer "what happened with
this asset?" is the one place you cannot ask about one asset. The API already accepts the
parameters: `allTransactions(params?: { ticker?, kind? })` → `GET /assets/transactions`.

**Deliver:**

- state `{ ticker: string | null, kind: 'buy' | 'sell' | null }`, both **in the React Query
  key**, so a filter change is a refetch and not a client-side narrowing. Filtering a
  fully-fetched array works at today's volume and fails at the first long ledger.
- the two filters compose
- the asset selector is built from market holdings that **have a ticker**
  (`hasFilterableTicker` from T2), so it never offers an option that returns nothing
- active filters are visible and individually clearable
- the empty state distinguishes "filtered to nothing" from "no trades at all"
- a row leads to that asset's drawer, via the `?asset=<id>` parameter from T11

**The predicate trap — do not reuse T9's test.** `hasFilterableTicker` is `!!asset.ticker`;
`externalLinksFor` additionally excludes `TD:` symbols. A Tesouro Direto bond is
**filterable** and **not externally linkable**. Reusing the display-level "is this a real
ticker?" check here would drop TD bonds out of the filter for no reason. The holdings table
special-cases the `TD:` prefix for *display* only (`renderHoldingRow` ~line 747) — that is a
display rule, not a filter rule.

**Preserve exactly:** the amber no-cost warning cards for holdings without recorded buys,
add/edit/delete of any trade, and adding a buy against a brand-new ticker via `assets.buy`.

Mutations go through `refetchAssetLedgerViews` from T3.

## Files affected

- `frontend/src/pages/assets.tsx` (the `AssetTransactionsTab` component)
- `frontend/src/locales/*.json` (nine files)

## Done when

Satisfies the spec's *Global Transactions tab* criteria (all seven): both filters composing via
the server parameters, an asset filter covering everything in the ledger including TD bonds, no
option that returns nothing, visible and individually clearable filters, an empty state that
distinguishes filtered-to-nothing, a row leading to the drawer, and existing behavior
preserved.

## Notes

Depends on T11 rather than T4 because "a row leads to that asset's drawer" is expressed through
the URL parameter.

## Outcome

`AssetTransactionsTab` now holds `{ filterTicker, filterKind }`, both in the query key
(`['asset-transactions', 'all', ticker, kind]`) and both sent to
`GET /assets/transactions` — parameters the endpoint has always accepted and the UI never used.
A `Select` for the asset, chips for the direction, a clear button when either is set, and an
empty state that distinguishes filtered-to-nothing from having no trades.

The asset options come from `hasFilterableTicker`, **not** `externalLinksFor` — so Tesouro
Direto bonds are offered (their `TD:` symbol is a valid filter key), which is the distinction
the spec called out. TD entries show the asset name rather than the synthetic symbol, which
would be unreadable in a dropdown.

**One edge the task did not anticipate.** The drawer resolves an asset against the
collection-filtered list, but this tab lists trades portfolio-wide — so with a collection
active, some rows point at assets the drawer cannot open. Rather than offering a click that
silently does nothing, those rows are rendered non-clickable (`openableAssetIds`). The
underlying inconsistency — the tab ignoring the collection filter — is pre-existing and left
alone; this just stops the new affordance from lying about it.

Three locale keys across nine files. `tsc` clean, 109/109, full `npm run build` green, lint at
the one pre-existing page warning.
