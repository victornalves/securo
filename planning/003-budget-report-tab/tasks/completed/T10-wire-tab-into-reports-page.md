# T10 — Wire the Budget tab into the reports page

| Field      | Value  |
| ---------- | ------ |
| Task       | T10    |
| Feature    | 003    |
| Status     | Done  |
| Depends on | T7, T9 |
| PR         | abe332e (local) |
| Jira       | —      |

## Description

Add the fifth tab to `/reports`: tab entry, its query, the Month-mode default, the hidden
interval selector, and the Collection-filter gate.

## Implementation guidance

All in `frontend/src/pages/reports.tsx`.

**Tab entry.** `REPORT_TABS` gains `{ key: 'budget', labelKey: 'reports.budget', enabled: true }`
as the **last** entry, after Money Map. Add `const isBudget = activeTab === 'budget'`.

**Range presets.** Reuse `HISTORICAL_RANGE_OPTIONS` (6M, YTD, 1Y, 2Y) — no new option set. In
`handleSelectTab`, the existing range-clamping branches already fall through to the historical
set for unknown keys; confirm `budget` lands there rather than adding a branch.

**Query.** A second `useQuery`, separate from the page's `ReportResponse` one because the shape
differs:

```ts
const { data: budgetData, isLoading: budgetLoading } = useQuery<BudgetReportResponse>({
  queryKey: ['reports', 'budget', mode, anchorMonth ?? rangeKey, months, period ?? null],
  queryFn: () => reports.budget(months, period, anchorMonth),
  enabled: isBudget && activeAccountIds === null,
})
```

and add `enabled: ... && !isBudget` to the existing report query so the two never both fire.

**Month-mode default.** The spec asks for Month mode on tab entry *unless the URL pins a mode*.
Add a `modePinnedByUser` ref, set to `true` in the Range/Month toggle's `onClick`. In
`handleSelectTab`, when `key === 'budget' && !modePinnedByUser.current && !searchParams.get('mode')`,
call `setMode('month')`.

The ref is what keeps this honest: the existing effect writes `?mode=month` to the URL itself, so
testing the URL alone would read the tab's own default back as a user pin one render later.

**Interval selector.** Extend the existing `hidden` condition to `isMoneyMap || isBudget || mode === 'month'`.

**Collection gate.** When `activeAccountIds !== null`, render the `reports.budgetCollectionNotice`
message in place of the chart and skip the query (the `enabled` flag above already does the
second half). Same precedent as the dashboard's budget metric in `385d967`: `/budgets` data is
workspace-wide, so a filtered actual against an unfiltered envelope would be a false comparison.

**Layout.** The shared hero card and the trend/breakdown block must not render on this tab —
`BudgetReport` brings its own summary. Follow the existing `{!isMoneyMap && (<>...</>)}` pattern:
gate the hero card on `{!isBudget && ...}` and render `<BudgetReport />` in the tab's branch.

**Cash-flow baseline toggle.** Already gated on `isCashFlow`; no change needed — just verify it
stays hidden on the new tab.

## Files affected

- `frontend/src/pages/reports.tsx`

## Done when

- The Budget tab appears last, is selectable, and renders `BudgetReport`.
- Entering the tab with no `?mode` in the URL selects Month mode; entering it after the user
  explicitly chose Range keeps Range.
- The month stepper re-queries on step; browser back/forward still works across mode/month
  changes (the existing URL-sync effects are untouched).
- The interval selector is hidden on the tab; the other four tabs behave exactly as before.
- With a Collection active, the notice shows and no request is issued (verify in the network tab).
- `tsc` and lint clean.

Satisfies the spec's tab, period-filter and Collection-filter criteria.
