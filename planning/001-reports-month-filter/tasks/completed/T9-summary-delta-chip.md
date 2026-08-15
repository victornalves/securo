# T9 — Frontend: "vs. previous month" delta chip on the summary

| Field      | Value      |
| ---------- | ---------- |
| Task       | T9         |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | T3, T7     |
| PR         | —          |
| Jira       | —          |

## Description

Render the "vs. previous month" comparison on each report tab's summary when in month mode,
using the `change_amount`/`change_percent` values the backend now computes for that mode (T3).

## Implementation guidance

From `plan.md` ADR "reuse existing `change_amount`/`change_percent` fields", which points to the
existing visual idiom in `dashboard.tsx` (lines ~932-954) as the pattern to mirror:

```tsx
{t('reports.summaryVsPrev', {
  month: monthLabel(shiftMonth(month, -1), uiLocale),
  delta: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`,
})}
<span className={changePercent >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
  {changePercent >= 0 ? '▲' : '▼'}
</span>
```

- Add a new i18n key (e.g. `reports.summaryVsPrev`) in `frontend/src/locales/*`, mirroring the
  shape of `dashboard.balanceFlowVsPrev`.
- Render this chip next to each tab's existing summary total, **only** when `mode === 'month'`
  (in range mode, the summary keeps its current rendering — this is additive, not a replacement).
- Use `shiftMonth(month, -1)` from `frontend/src/lib/month-utils.ts` (already used by
  `dashboard.tsx` for the same purpose) to label which month is being compared against — purely
  for display; the actual delta values come from the API response (`change_amount`/`change_percent`),
  not computed client-side.

## Files affected

- `frontend/src/pages/reports.tsx`
- `frontend/src/locales/*` (new translation key)

## Done when

- Satisfies spec Acceptance Criteria: "each report tab's summary shows a comparison against the
  previous month (delta value and/or percentage)."
- Manual QA: in month mode, each of the four tabs' summary shows the delta chip with correct
  sign/color; switching back to range mode hides it (existing summary rendering unaffected).

## Notes

Depends on T3 for correct backend values and T7 for `mode`/`month` state to exist; can be done in
parallel with T8 since they touch different parts of the summary/interval UI.
