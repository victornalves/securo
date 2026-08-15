# T10 — Full acceptance-criteria pass (integration + manual QA)

| Field      | Value      |
| ---------- | ---------- |
| Task       | T10        |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | T1, T2, T3, T4, T5, T6, T7, T8, T9 |
| PR         | —          |
| Jira       | —          |

## Description

Capstone task: walk every acceptance criterion in `spec.md` end-to-end across all four tabs and
confirm no regression to the existing rolling-window behavior, since no earlier task exercises
the full feature together.

## Implementation guidance

Go through `spec.md`'s Acceptance Criteria list one by one, on all four tabs (net worth, income &
expenses, cash flow, money map):

1. Month selector present and reachable via one toggle action, on all four tabs.
2. Selecting a month scopes data to exactly that month (spot-check against raw transaction data
   for at least one month on each tab).
3. Month navigation reaches back to `/reports/bounds`' `earliest_month` and no further; reaches
   forward to the current month.
4. Switching Range↔Month and switching tabs never silently drops the other mode's selection.
5. Rolling-window presets (6m/1y/2y/ytd/etc.) still behave exactly as before on all tabs.
6. A month with no data shows the existing "no data" state, not an error, on every tab.
7. Net worth and income & expenses default to daily granularity in month mode; cash flow stays
   daily; interval toggle is disabled/hidden appropriately.
8. Every tab's summary shows a "vs. previous month" delta with correct sign/color in month mode.
9. Browser back/forward and page reload preserve `mode`/`month`/`rangeKey` via the URL.
10. Run the full backend (`pytest backend/tests/test_report_service.py backend/tests/test_report_service_coverage.py`)
    and frontend (`vitest run`) suites — all green, no regressions introduced by T1-T9.

Log any deviation found against the specific acceptance criterion it violates, fix forward within
this task (small fixes) or file a new task if the fix is non-trivial.

## Files affected

- None directly — this task verifies T1-T9's combined output; any fixes it produces land in the
  relevant existing files from those tasks.

## Done when

- Every acceptance criterion in `spec.md` is checked off.
- Both test suites pass in full.
- Manual QA steps above are completed and any findings resolved or explicitly logged.

## Notes

This is the last task before the spec can move to the Done table in `planning/README.md`.
