# T4 — Extract the drawer's merge into `lib/drill-down-utils.ts`

| Field      | Value |
| ---------- | ----- |
| Task       | T4    |
| Feature    | 006   |
| Status     | Done  |
| Depends on | —     |
| PR         |       |
| Jira       | —     |

## Description

Move the transaction/projection merge and the footer arithmetic out of the component into a pure
module, and replace the binary `isProjected` with a three-valued `kind`. No behaviour change in this
task.

## Implementation guidance

The merge currently lives in a `useMemo` inside `frontend/src/components/transaction-drill-down.tsx`
(the `displayItems` block, roughly lines 95-138), and the footer total in the `absTotal` reduce below
it. The frontend has no component-testing stack — only pure-logic tests under `src/lib/`
(`budget-report-utils.test.ts`, `rule-match-utils.test.ts`, `selection-utils.test.ts`) — so the
logic has to leave the component to become testable. Same treatment spec 004 gave
`budget-report-utils.ts`.

Create `frontend/src/lib/drill-down-utils.ts` exporting:

```ts
export type DrillDownKind = 'realized' | 'planned' | 'projected'

export type DisplayItem = {
  key: string
  description: string
  date: string
  type: 'debit' | 'credit'
  amount: number
  amountPrimary: number | null
  currency: string
  categoryIcon: string | null
  categoryName: string | null
  categoryColor: string | null
  kind: DrillDownKind
  attachmentCount: number
  transaction: Transaction | null
}

export function buildDrillDownItems(input: {
  transactions: Transaction[]
  projections: ProjectedTransaction[]
  filter: DrillDownFilter | null
}): DisplayItem[]

export function summarizeDrillDown(
  items: DisplayItem[],
  userCurrency: string,
): { absTotal: number; plannedCount: number; plannedTotal: number }
```

`DrillDownFilter` moves here too (or is imported here from the component — pick one home and keep
the component re-exporting it, since `dashboard.tsx:45` imports the type from the component today
and that import should not break).

Rules to carry across **verbatim**:

- Stored rows keep `key: tx.id`; projections keep `key: proj-${pt.recurring_id}-${pt.date}`.
- Projections are filtered client-side by `filter.type`, `filter.category_id`, `filter.uncategorized`,
  `filter.from`, `filter.to` — that logic is already correct, do not rewrite it.
- Final sort is `a.date.localeCompare(b.date)`.
- `summarizeDrillDown` uses the existing conversion rule exactly: native `amount` when
  `item.currency === userCurrency`, else `amountPrimary`, and **skip the row** when neither applies.
  The current comment explaining why (a raw foreign amount must not be added as if it were primary,
  matching `get_summary`) moves with the code.

The one new thing: `kind`. Projections are `'projected'`; stored rows are
`tx.status === 'planned' ? 'planned' : 'realized'`. `plannedCount` / `plannedTotal` count only
`kind === 'planned'` — **projections are excluded from them**, because a projection is not a stored
commitment and the footer line must not claim otherwise. `plannedTotal` uses the same
currency rule as `absTotal` so the two cannot disagree about a row.

In the component, the `useMemo` becomes a call to `buildDrillDownItems` and the reduce becomes a call
to `summarizeDrillDown`. Replace `item.isProjected` at both use sites (the row's `cursor-pointer`
class and the click handler) with `item.kind === 'projected'`.

## Files affected

- `frontend/src/lib/drill-down-utils.ts` (new)
- `frontend/src/components/transaction-drill-down.tsx`

## Done when

The drawer behaves identically to before this task in both preference states, `npm run build`
type-checks, and the two functions are importable and pure (no React, no query client, no `t()`).

## Notes

Keep `formatCurrency` in the component — it is presentation, and pulling `Intl` into the utils module
would make the tests locale-dependent.
