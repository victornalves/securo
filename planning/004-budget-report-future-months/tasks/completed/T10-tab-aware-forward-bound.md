# T10 — Tab-aware forward bound and the month clamp

| Field      | Value |
| ---------- | ----- |
| Task       | T10   |
| Feature    | 004   |
| Status     | Done  |
| Depends on | T5    |
| PR         |       |
| Jira       | —     |

## Description

Let the stepper go forward on the Budget tab only, and clamp the selection when the user leaves
it.

## Implementation guidance

`frontend/src/pages/reports.tsx`:

- the `MonthStepper` at line 661 currently hardcodes `maxDate={new Date()}`. Make it
  `maxDate={isBudget && bounds?.latest_month ? parseMonth(bounds.latest_month) : new Date()}`,
  reusing the same `parseMonth` the `minDate` uses. `isBudget` already exists (line 271).
- in `handleSelectTab`, when leaving `budget` with a future month selected, clamp `month` back
  to the current month. The existing state→URL effect mirrors it, so the URL follows with no
  extra work — the same reason `handleSelectTab` checks `searchParams.get('mode')` rather than
  writing the URL itself (see the comment there).
- do **not** introduce per-tab month state. One month, one URL parameter (004 plan ADR).
- Range mode is untouched: no forward preset, `HISTORICAL_RANGE_OPTIONS` unchanged (spec D1).

A future month keeps working on a shared URL: pinning `?tab=budget&mode=month&month=2026-11`
opens on that month, because the clamp only fires on a tab change.

## Files affected

- `frontend/src/pages/reports.tsx`

## Done when

Satisfies the **Forward navigation** criteria for the stepper, the other four tabs' bound, the
clamp, and URL persistence.

Verified by: stepping to +12 disables the forward arrow; switching to Net Worth from a future
month lands on the current month with the URL updated; a pinned future-month URL opens on it.

## Notes

**Outcome.** As planned — `maxDate` reads `bounds.latest_month` only when `isBudget`, and
`handleSelectTab` clamps a future month when leaving the tab. No new state, no URL write: the
existing state->URL effect mirrors the clamp.
