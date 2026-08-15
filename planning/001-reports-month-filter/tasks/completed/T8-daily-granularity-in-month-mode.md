# T8 — Frontend: force daily granularity in month mode

| Field      | Value      |
| ---------- | ---------- |
| Task       | T8         |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | T7         |
| PR         | —          |
| Jira       | —          |

## Description

When `mode === 'month'`, net worth and income & expenses must default their chart/table
granularity to daily (cash-flow is already daily by default); the interval toggle should be
disabled while in month mode since forcing daily is the point.

## Implementation guidance

From `plan.md` ADR "interval default in month mode" (see `plan.md` for the full ADR text):

- In `reports.tsx`, wherever `interval` is currently forced/clamped on tab switch (existing logic
  around line ~195 that forces `'daily'` for cash-flow), add an equivalent effect/branch: when
  `mode` transitions to `'month'`, set `interval = 'daily'` for net worth and income & expenses
  (cash-flow is already daily, no-op for it; money map has no interval concept at all).
- Disable/hide the interval toggle buttons (lines ~517-531) while `mode === 'month'`, on the tabs
  that have one (net worth, income & expenses, cash-flow) — money map already hides them
  unconditionally today.
- Do **not** add any backend inference for this — per the plan, interval stays a purely
  client-driven value sent verbatim to the backend (T1/T2 don't change interval handling at all).

## Files affected

- `frontend/src/pages/reports.tsx`

## Done when

- Satisfies spec Acceptance Criteria: "In single-month mode, net worth and income & expenses
  default to daily granularity; cash flow keeps its existing daily default."
- Manual QA: switch to month mode on net worth / income & expenses — interval snaps to daily and
  the toggle becomes disabled/hidden; switch back to range mode — toggle is available again with
  its previous value.

## Notes

Small, focused task — depends on `mode` existing from T7 but touches a different slice of
`reports.tsx` (interval state, not the toggle/URL-sync machinery).
