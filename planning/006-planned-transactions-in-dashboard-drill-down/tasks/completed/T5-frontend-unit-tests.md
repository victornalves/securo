# T5 — Unit tests for the drill-down utils

| Field      | Value |
| ---------- | ----- |
| Task       | T5    |
| Feature    | 006   |
| Status     | Done  |
| Depends on | T4    |
| PR         |       |
| Jira       | —     |

## Description

Cover the classification, the totals, and the absence of double counting, at the level where the
logic is now pure.

## Implementation guidance

New file `frontend/src/lib/drill-down-utils.test.ts` (vitest, `npm run test` → `vitest run`),
following the style of `frontend/src/lib/budget-report-utils.test.ts`.

Tests:

1. **Classification.** A stored row with `status: 'planned'` maps to `kind: 'planned'`; any other
   status to `'realized'`; a projection to `'projected'`.
2. **One total covering every kind.** `summarizeDrillDown` returns a single `absTotal` that includes
   realized, planned and projected rows — this is the figure that must equal the chart.
3. **Planned portion excludes projections.** Given one planned row and one projection,
   `plannedCount === 1` and `plannedTotal` equals the planned row's amount only.
4. **No double counting.** A projection and a planned row with the same description and date both
   survive the merge and each contributes once. (They are complementary by construction —
   `_get_recurring_projections` enumerates from `next_occurrence` forward and `generate_pending`
   advances past everything it materializes — so the merge must not attempt to dedupe them.)
5. **FX.** A row whose `currency` differs from the user's and whose `amountPrimary` is `null` is
   skipped by both `absTotal` and `plannedTotal`. A row with `amountPrimary` set contributes that
   value, not the native one.
6. **Projection filtering survived the extraction.** Projections are dropped by a non-matching
   `filter.type`, a non-matching `filter.category_id`, `filter.uncategorized` when the projection has
   a category, and by `filter.from` / `filter.to` bounds.
7. **Sort order.** Output is ascending by `date` regardless of input order or kind.

## Files affected

- `frontend/src/lib/drill-down-utils.test.ts` (new)

## Done when

`npm run test` passes from `frontend/`, including the pre-existing `i18n.test.ts` and the three other
`lib` suites.

## Notes

Test 4 is the guard on the invariant the whole feature rests on. If a future change makes projections
overlap materialized rows, this test will not catch it — but the comment in it should say where the
invariant actually lives (`recurring_transaction_service.generate_pending`).
