# T3 — Centralize ledger invalidation (fixes an existing gap)

| Field      | Value |
| ---------- | ----- |
| Task       | T3    |
| Feature    | 008   |
| Status     | Done  |
| Depends on | T1    |
| PR         |       |
| Jira       |       |

## Description

Replace the scattered per-component cache invalidation after a trade mutation with one helper
that refetches the complete set. This fixes a defect that exists today, independently of the
drawer.

## Implementation guidance

From `plan.md` → ADR *centralize ledger invalidation, because it is incomplete today*.

**The existing gap.** A trade mutation currently refetches `['asset-transactions']` inside the
mutating component, then calls `refetchAssetViews` (`pages/assets.tsx` ~line 343), which
covers `['assets']`, `['portfolio-trend']` and `['dashboard']`. **Neither path refetches
`['asset-trend', assetId]` or `['asset-values', assetId]`.** But `recompute_and_cache` calls
`_apply_price_to_asset` for market-priced assets, which rewrites today's `AssetValue` to match
the new quantity — so a trade already changes the value series without the chart being told.
It is easy to miss today because the chart and the ledger sit in a row the user is about to
collapse; in the drawer they are six scroll-lines apart.

**The helper:**

```ts
export function refetchAssetLedgerViews(queryClient: QueryClient, assetId?: string) {
  // ['asset-transactions'], ['asset-transactions', assetId],
  // ['asset-values', assetId], ['asset-trend', assetId],
  // ['assets'], ['portfolio-trend'], ['dashboard']
}
```

Use `refetchQueries`, **not** `invalidateQueries`. That choice is deliberate and documented at
`refetchAssetViews`: the global 5-minute `staleTime` combined with the dialog-close re-render
was leaving pre-edit data on screen until a manual reload.

Wire every trade mutation through it — `addTransaction`, `updateTransaction`,
`deleteTransaction`, `buy` — wherever triggered: `HoldingLedger`,
`AddHoldingTransactionDialog`, and `AssetTransactionsTab`. Leave `refetchAssetViews` in place
for the asset CRUD mutations (create/update/delete asset, wallet operations) that do not touch
the ledger.

Accepted cost: one extra refetch pair per trade when the chart is not rendered. Correctness of
a visible figure over a saved request.

## Files affected

- `frontend/src/pages/assets.tsx`
- `frontend/src/components/assets/HoldingLedger.tsx`
- `frontend/src/components/assets/AddHoldingTransactionDialog.tsx`
- `frontend/src/components/assets/asset-format.ts` (or wherever the shared helper lands)

## Done when

Satisfies the spec's *Buy and sell parity* criterion: "after a successful save or delete, the
drawer's position summary, comparison, chart and list all reflect the change, and so does the
holding's row in the table behind it. No manual refresh, no stale figure in either surface."

Verified manually before T4 exists, using the inline expansion: expand a market-priced
holding, add a buy, and confirm the value chart above the ledger updates without collapsing
and re-expanding the row. That is the behavior that is broken today.

## Notes

This is a bug fix that happens to be a prerequisite. Worth its own commit message so it is
findable independently of the drawer work.

## Outcome

`lib/asset-queries.ts` exports `refetchAssetLedgerViews(queryClient, assetId?)`. All three
trade-mutation sites now go through it: `HoldingLedger`'s delete,
`AddHoldingTransactionDialog`'s save, and `AssetTransactionsTab`'s `afterChange`.

Two corrections to what the task assumed:

- **The per-asset `asset-transactions` refetch was redundant.** React Query v5 matches query
  keys by prefix unless `exact` is set, so `['asset-transactions']` already covers every
  `['asset-transactions', id]` query. The previous code refetched both explicitly — a duplicate
  request for the same data. The helper issues one call and says why in a comment.
- **`AssetTransactionsTab` passes no asset id.** It edits trades across the whole portfolio, so
  there is no single per-asset value series to refetch; the drawer that owns a given asset's
  chart refetches it when the drawer is the mutation's origin.

`refetchAssetViews` stays as-is for the asset and wallet CRUD mutations that do not touch the
ledger. Verified: `tsc -b` clean, 106/106 tests, lint unchanged at the two pre-existing warnings.
