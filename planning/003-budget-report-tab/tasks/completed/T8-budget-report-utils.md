# T8 — Pure chart helpers and their unit tests

| Field      | Value |
| ---------- | ----- |
| Task       | T8    |
| Feature    | 003   |
| Status     | Done  |
| Depends on | T7    |
| PR         | 4529a34 (local) |
| Jira       | —     |

## Description

Put the tab's decision logic in a pure module with vitest coverage, so the component stays
rendering-only. This repo has no component-level testing (vitest covers `lib/` and locale
parity), so anything worth asserting has to live outside the component.

## Implementation guidance

New `frontend/src/lib/budget-report-utils.ts`:

```ts
export interface BudgetChartDatum {
  key: string            // category id, or 'out_of_budget'
  label: string
  color: string
  realized: number
  budgeted: number | null   // null for the out-of-budget column → no second bar
  over: boolean
  coverage: { budgeted: number; total: number } | null  // null when fully covered
}

export function buildBudgetChartData(
  response: BudgetReportResponse,
  outOfBudgetLabel: string,
): BudgetChartDatum[]
```

Rules:

- One datum per row, in the order the backend returned them (already sorted by realized desc —
  do not re-sort).
- Append the out-of-budget datum **last**, always, regardless of magnitude, with
  `budgeted: null` and a neutral colour constant exported from this module.
- Omit the out-of-budget datum entirely when `summary.out_of_budget` is 0.
- `over = realized > budgeted` — strictly greater. Equality is *not* over budget; assert this
  boundary in the tests.
- `coverage` is `null` when `months_budgeted === months_in_window`, otherwise the pair — the
  component renders the coverage line only when it is non-null.

Tests in `frontend/src/lib/budget-report-utils.test.ts` (vitest, no DOM):

- Ordering preserved, out-of-budget appended last even when it is the largest value.
- Out-of-budget omitted when zero.
- `over` at the exact boundary (`realized === budgeted` → `false`), just above, just below.
- `coverage` null on full coverage, populated on partial (8 of 12).
- Empty `rows` with a non-zero `out_of_budget` → a single datum.
- Empty `rows` with zero `out_of_budget` → empty array (the component's empty state).

## Files affected

- `frontend/src/lib/budget-report-utils.ts`
- `frontend/src/lib/budget-report-utils.test.ts`

## Done when

`npm test` (vitest) passes with the cases above, and `tsc` is clean.
