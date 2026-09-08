import type { QueryClient } from '@tanstack/react-query'

/**
 * Refetch everything a change to an asset's trade ledger can affect.
 *
 * Before this existed, invalidation was spread across each mutating component
 * and was incomplete: a trade refetched `['asset-transactions']` and then the
 * page's `refetchAssetViews` (`assets`, `portfolio-trend`, `dashboard`), but
 * **neither path touched `['asset-trend', id]` or `['asset-values', id]`**.
 * A trade does change those: `recompute_and_cache` calls
 * `_apply_price_to_asset` for market-priced assets, which rewrites today's
 * `AssetValue` to match the new quantity. The stale value chart was easy to
 * miss while it sat in a table row the user was about to collapse; in the
 * detail drawer it sits a few lines from the ledger that changed it.
 *
 * `refetchQueries`, not `invalidateQueries`, on purpose — the same reason
 * `refetchAssetViews` gives: the global 5-minute `staleTime` plus a
 * dialog-close re-render was leaving pre-edit data on screen until a manual
 * reload.
 *
 * See planning/008-asset-detail-drawer.
 */
export function refetchAssetLedgerViews(queryClient: QueryClient, assetId?: string | null) {
  // React Query matches query keys by prefix unless `exact` is set, so this one
  // call covers both the portfolio-wide `['asset-transactions']` list and every
  // per-asset `['asset-transactions', id]` query. The previous code refetched
  // both explicitly, which was a duplicate request for the same data.
  queryClient.refetchQueries({ queryKey: ['asset-transactions'] })
  queryClient.refetchQueries({ queryKey: ['assets'] })
  queryClient.refetchQueries({ queryKey: ['portfolio-trend'] })
  queryClient.refetchQueries({ queryKey: ['dashboard'] })
  if (assetId) {
    queryClient.refetchQueries({ queryKey: ['asset-values', assetId] })
    queryClient.refetchQueries({ queryKey: ['asset-trend', assetId] })
  }
}
