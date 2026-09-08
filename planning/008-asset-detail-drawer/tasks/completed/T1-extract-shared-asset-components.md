# T1 — Extract the shared asset components out of the page module

| Field      | Value |
| ---------- | ----- |
| Task       | T1    |
| Feature    | 008   |
| Status     | Done  |
| Depends on | —     |
| PR         |       |
| Jira       |       |

## Description

Move `AssetDetail`, `HoldingLedger` and `AddHoldingTransactionDialog` out of
`pages/assets.tsx` into `components/assets/`, with **no behavior change whatsoever**. This is
groundwork: the drawer (T4) and the global tab (T12) both need these components, and a page
module cannot export them without becoming a component library.

## Implementation guidance

From `plan.md` → *Architecture & Components* → "What leaves `assets.tsx`" and *Risks*.

The three components are defined inline in the 2868-line `pages/assets.tsx`:

- `AssetDetail` (~line 1962) — two modes. `chartOnly` renders only the value-evolution chart;
  the full mode adds the manual value form and the `AssetValue` history list.
- `HoldingLedger` (~line 2658) — the per-asset trade list.
- `AddHoldingTransactionDialog` (~line 2747) — the buy/sell dialog for an existing holding.

They also depend on module-level helpers in the same file that must move or be shared:
`formatCurrency`, `assetErrorMessage`, `renderAssetTradeDot`, and the `AssetIcon` /
`getTypeConfig` / `ASSET_TYPE_CONFIG` cluster. Put shared helpers where both the page and the
new components can import them (`components/assets/asset-format.ts` or similar); do **not**
duplicate them.

**Naming:** PascalCase files under `components/assets/`, matching the existing subfolder
convention (`components/reports/BudgetReport.tsx`, `components/agents/*`) rather than the
kebab-case used at the `components/` root.

**Two callers of `AddHoldingTransactionDialog` exist today** and both must keep working:
the holdings table's `+ add buys` link (~line 772, via `openAddTransaction`) and the inline
ledger's add button. T4 removes the second one; this task changes neither.

**Constraint:** this task is a pure move. No prop renamed, no query key changed, no markup
edited, no string added. A reviewer should be able to confirm correctness by diffing the moved
bodies against the originals. Behavior changes belong to T3 and later.

## Files affected

- `frontend/src/pages/assets.tsx`
- `frontend/src/components/assets/AssetDetail.tsx` (new)
- `frontend/src/components/assets/HoldingLedger.tsx` (new)
- `frontend/src/components/assets/AddHoldingTransactionDialog.tsx` (new)
- `frontend/src/components/assets/asset-format.ts` (new — shared helpers)

## Done when

No acceptance criterion maps to this task directly; it satisfies the plan's stated mitigation
for the review risk of a large diff against a 2868-line file. Verified by:

- `/assets` behaves identically before and after: wallet sections, wallet totals, collapse
  state, row expansion for both `market_price` and `manual` assets, the `+ add buys` link, and
  the transactions tab.
- Lint and the TypeScript build pass.

## Notes

Expect this to be the largest diff of the feature while changing the least. Keeping it
separate is the point.

## Outcome

Six modules under `frontend/src/components/assets/`: `AssetDetail.tsx`,
`HoldingLedger.tsx`, `AddHoldingTransactionDialog.tsx`, `AssetIcon.tsx`,
`asset-types.ts` (the type→icon config) and `asset-format.ts` (`formatCurrency`,
`formatRelativeTime`, `assetErrorMessage`). `pages/assets.tsx` went from 2869 to 2260 lines.

`ASSET_TYPE_CONFIG` and `getTypeConfig` landed in their own `asset-types.ts` rather than
beside `AssetIcon`, because eslint's `react-refresh/only-export-components` rule flags a file
that exports both a component and shared constants — the rule's own advice is a separate file.

Verified: `tsc -b` clean, 83/83 tests pass, and `eslint` reports the **same two warnings as
the pre-extraction baseline** (`set-state-in-effect` in the dialog's reset effect,
`exhaustive-deps` on `activeAssets`) — both moved with the code, neither introduced here.
