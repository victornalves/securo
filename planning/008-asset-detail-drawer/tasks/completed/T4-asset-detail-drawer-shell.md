# T4 — `AssetDetailDrawer` shell, replacing the inline row expansion

| Field      | Value  |
| ---------- | ------ |
| Task       | T4     |
| Feature    | 008    |
| Status     | Done   |
| Depends on | T1, T3 |
| PR         |        |
| Jira       |        |

## Description

The structural change: a right-side drawer becomes the single detail surface for a holding,
and the inline row expansion is removed. This task delivers the shell, the dismissal
behavior, and the two-body selection — later tasks fill the bodies.

## Implementation guidance

From `plan.md` → *Architecture & Components* and spec decision D1.

**Panel mechanics** — follow `components/transaction-drill-down.tsx` (~line 137), which is the
established pattern in this codebase: a `fixed inset-0 bg-black/20 z-40` backdrop, a
`fixed top-0 right-0 h-full` panel with a translate transition, an Escape key listener, and a
click-outside listener registered behind a ~100 ms `setTimeout` so the click that opened the
drawer does not immediately close it. Header carries the subject and an `X` button; the body
scrolls; a footer summarizes.

**Width** — wider than the drill-down's `max-w-md`, which is comfortable for one list and
tight for a summary plus a chart plus a comparison plus a filtered list. Full width below the
`sm` breakpoint, capped above it. (Plan leaves the exact cap to implementation; the drill-down
is the floor, not the target.)

**Body selection:**

- `valuation_method === 'market_price'` → ledger body (T5, T6, T7, T8)
- otherwise (`manual`, `growth_rule`) → valuation body (T10)

**Props, not fetches.** The drawer receives the `Asset` object and the page's
`portfolioTotalPrimary` as props. `pages/assets.tsx` already holds the full list under
`['assets']` (`assets.list(false)`), so the drawer must not fetch the asset again. It fetches
only per-asset series: `['asset-transactions', id]`, `['asset-values', id]`,
`['asset-trend', id]`.

**Removing the expansion** — in `renderHoldingRow` (~line 823) the `isExpanded &&` block goes
away entirely, along with the `expandedId` state. The row click opens the drawer instead. Row
actions (move to wallet, edit, delete) already `stopPropagation` and must continue **not** to
open the drawer. Update the chevron affordance to reflect what the row now does.

**Position closing mid-session.** A sale that closes a position flips `sell_date` server-side
(`recompute_and_cache`), which drops the holding out of the active list the drawer's asset prop
came from. Detect the disappearance after the refetch and close the drawer with a toast naming
what happened — do not leave a drawer bound to a stale object or throw on a null asset.

**Privacy mode** — every figure goes through `mask()` from `usePrivacyMode`, as the holdings
table and inline ledger already do.

**Permissions** — a provider-owned synced asset (`source !== 'manual' && valuation_method !==
'market_price'`) exposes no write action, matching the table's `syncedReadOnly` treatment; a
user without `canWrite` sees no write affordance at all.

## Files affected

- `frontend/src/components/assets/AssetDetailDrawer.tsx` (new)
- `frontend/src/pages/assets.tsx`

## Done when

Satisfies the spec's *Opening and dismissing* criteria in full:

- row click opens the drawer; no holding renders `AssetDetail` or `HoldingLedger` inside the table
- Escape, click-outside and the close button all dismiss; the opening click does not
- row actions still work and do not open the drawer
- switching assets carries no figures or rows over from the previous one
- every figure is masked in privacy mode

Plus the *Buy and sell parity* criteria on synced and read-only assets.

## Notes

The close-on-disappear behavior is the plan's highest-likelihood risk. Get it right here
rather than discovering it in T6 when sells become easy to trigger.

## Outcome

`components/assets/AssetDetailDrawer.tsx`, mounted from `pages/assets.tsx` alongside the other
overlays. `expandedId` is gone, replaced by `openAssetId`; the 20-line expansion block in
`renderHoldingRow` is gone; the chevron is now `ChevronRight`, since the row no longer promises
an in-place expansion.

Three things worth recording:

- **The lint config forbids reading a ref during render.** The first implementation kept the
  last asset in a ref so the panel would not empty itself during the 200 ms slide-out —
  `react-hooks/refs` rejected it with 52 errors. Dropped in favour of exactly what
  `TransactionDrillDown` does: the chrome stays mounted and animates, the contents render only
  while an asset is open, so closing slides out an empty panel. Consistency with the existing
  drawer is the better argument anyway.
- **`HoldingLedger` now calls `usePrivacyMode()` itself** instead of taking a `mask` prop,
  matching its sibling `AssetDetail`. One less prop to plumb through the drawer.
- **No new locale key for the header subtitle.** It reuses the holdings row's own rule — the
  name when a ticker headlines the panel, `Tesouro Direto` for a `TD:` symbol, otherwise the
  translated type label. One key was added, `assets.drawerClosedGone`, for the
  position-closed-while-open case.

Verified: `tsc -b` clean, 106/106 tests, `eslint` back to the two pre-existing warnings and
zero errors.
