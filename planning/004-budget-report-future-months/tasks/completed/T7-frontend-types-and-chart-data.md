# T7 — Frontend types and chart data on the committed basis

| Field      | Value |
| ---------- | ----- |
| Task       | T7    |
| Feature    | 004   |
| Status     | Done  |
| Depends on | T4    |
| PR         |       |
| Jira       | —     |

## Description

Mirror the schema changes in TypeScript and move the chart's derived values onto
`realized + planned`.

## Implementation guidance

`frontend/src/types/index.ts` — mirror T4's diff exactly (`planned` on the row;
`planned`, `committed_balance`, `out_of_budget_planned` on the summary), and add
`latest_month: string` to the bounds type from T5.

`frontend/src/lib/budget-report-utils.ts` — `BudgetChartDatum` gains:

```ts
planned: number
/** realized + planned — the basis for `over` and the tooltip's committed row. */
committed: number
```

In `buildBudgetChartData`:

- `committed = row.realized + row.planned`;
- `over: committed > row.budgeted` — still strictly greater, spending exactly the envelope is
  not overspending;
- the out-of-budget column is pushed when `summary.out_of_budget + summary.out_of_budget_planned > 0`,
  carrying both halves and `budgeted: null` as today;
- `coverage` is unchanged.

Extend `budget-report-utils.test.ts` with the committed-basis cases: over by planned alone, over
by realized alone, mixed, exactly-on-envelope, and an out-of-budget column whose realized half
is zero.

## Files affected

- `frontend/src/types/index.ts`
- `frontend/src/lib/budget-report-utils.ts`
- `frontend/src/lib/budget-report-utils.test.ts`

## Done when

Satisfies *"Over-budget is evaluated on `realized + planned` against `budgeted`"* (data half)
and *"The out-of-budget column splits realized and planned the same way"*.

## Notes

**Outcome.** Types mirrored, `BudgetChartDatum` gained `planned` and `committed`, `over` moved to
the committed basis, and the out-of-budget column now appears when either half is non-zero.
`reports.bounds()` in `lib/api.ts` returns `latest_month` too. Six new cases in
`budget-report-utils.test.ts`.
