# T9 — `BudgetReport` component: summary row and grouped column chart

| Field      | Value |
| ---------- | ----- |
| Task       | T9    |
| Feature    | 003   |
| Status     | Done  |
| Depends on | T8    |
| PR         | abe332e (local) |
| Jira       | —     |

## Description

The whole tab body: its own summary row (the shared hero card is time-series shaped and does not
apply here) plus the grouped column chart of realized vs budgeted per category, ending in the
out-of-budget column.

## Implementation guidance

New `frontend/src/components/reports/BudgetReport.tsx`, following `CashflowSankey.tsx` as the
precedent for a self-contained report component. Props: the `BudgetReportResponse`, `currency`,
`locale`, `isLoading`, and the privacy helpers (`mask`, `privacyMode`, `MASK`) — the page owns
data fetching, the component owns rendering.

**Summary row.** Same card shell and typography as the page's hero card (`bg-card rounded-xl
border border-border shadow-sm`, `text-3xl font-bold tabular-nums` for the primary figure):

- Primary: `summary.balance`, labelled *Budget Balance* — emerald when `>= 0`, rose when
  negative, matching the dashboard metric's colouring exactly.
- Alongside: `summary.budgeted`, `summary.realized`, `summary.out_of_budget`, rendered like the
  hero card's breakdown items (colour dot + label + value).

**Chart.** Recharts `BarChart` over `buildBudgetChartData(...)` from T8, two `<Bar>` series
(`realized`, `budgeted`) — grouped, *not* stacked, so no `stackId`.

- `<Cell>` per datum on the realized bar: rose (`#F43F5E`, the overspend colour used elsewhere
  on this page) when `over`, otherwise the category colour; the out-of-budget column takes the
  neutral constant from T8.
- The budgeted series uses a muted/outlined treatment so the realized bar reads as the subject
  and the envelope as the reference.
- Width: wrap in an `overflow-x-auto` container and give the chart
  `max(containerWidth, data.length * 84)`. A squeezed `ResponsiveContainer` silently drops
  labels, which the spec's "legible at 20+ categories" criterion forbids.
- `XAxis interval={0}` with angled labels, truncated to ~14 chars; full name in the tooltip.
- `YAxis` formatted with the page's `formatCompact`, returning `''` under privacy mode — same
  as the other tabs.

**Tooltip** per category: budgeted, realized, difference, `percentage_used`, and — only when
`coverage` is non-null — the coverage line (`reports.budgetCoverage`, e.g. "Budgeted in 8 of 12
months"). That line is the guard against partial coverage reading as a blowout.

**States.** Skeletons while `isLoading`, mirroring the other tabs' skeleton shapes. Empty state
(`reports.noBudgets`) when the chart data is empty — a budget-specific message, not the generic
`reports.noData`, because "you have no budgets" and "there is no data" are different situations.

**Privacy mode** masks every figure: summary values, axis ticks, tooltip.

Add the i18n keys to all nine locale files in `frontend/src/locales/`: `reports.budget`,
`budgeted`, `realized`, `outOfBudget`, `budgetBalance`, `overBudget`, `budgetCoverage`
(`"Budgeted in {{count}} of {{total}} months"`), `budgetCollectionNotice`, `noBudgets`,
`percentUsed`. `i18n.test.ts` enforces key *and* placeholder parity across locales — a key added
to `en.json` alone fails the suite.

## Files affected

- `frontend/src/components/reports/BudgetReport.tsx`
- `frontend/src/locales/*.json` (9 files)

## Done when

- The component renders summary + chart from a `BudgetReportResponse`, with the out-of-budget
  column last and over-budget categories visually marked.
- `npm test` passes, including `i18n.test.ts` with the new keys.
- `tsc` and lint clean.

Satisfies the spec's chart, tooltip, hero, empty-state and privacy criteria. Wiring into the
page is T10.
