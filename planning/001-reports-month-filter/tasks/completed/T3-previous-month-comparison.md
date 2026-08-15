# T3 — Backend: "vs. previous month" comparison in month mode

| Field      | Value      |
| ---------- | ---------- |
| Task       | T3         |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | T1, T2     |
| PR         | —          |
| Jira       | —          |

## Description

When `anchor_month` is set, each report's summary `change_amount`/`change_percent` must compare
the selected month's value against the immediately preceding calendar month, instead of each
report's current default comparison (period-start-vs-last-point, first-vs-last-bucket, or
forecast-vs-current-balance).

## Implementation guidance

From `plan.md` ADR "reuse existing `change_amount`/`change_percent` fields for 'vs. previous month'":

- Add a shared helper in `report_service.py`:

  ```python
  def _previous_month_change(current_value: float, previous_value: float) -> tuple[float, float | None]:
      change_amount = current_value - previous_value
      change_percent = (change_amount / abs(previous_value) * 100) if previous_value else None
      return change_amount, change_percent
  ```

- In each of the three report functions, when `anchor_month` is set:
  - Compute `previous_month = shift the anchor month back by one` (mirror the frontend's
    `shiftMonth` semantics — same year-rollover handling).
  - Fetch/derive that previous month's primary value the same way the current month's is derived
    (net worth: snapshot at previous month's end; income-expenses: net total for the previous
    month; cash-flow: ending balance for the previous month).
  - Call `_previous_month_change()` and assign the result to `ReportSummary.change_amount` /
    `change_percent`, replacing the function's normal (non-month-mode) computation for this call
    only.
- No schema change — `ReportSummary` already has both fields (see `backend/app/schemas/report.py`).
- Edge case: if the previous month has no data (e.g. anchor month is the workspace's earliest
  month), `previous_value` is `0`/`None` as appropriate — follow the existing null-handling
  convention in `_previous_month_change` above (`change_percent = None` when `previous_value` is 0).

## Files affected

- `backend/app/services/report_service.py`
- `backend/tests/test_report_service_coverage.py`

## Done when

- Satisfies spec Acceptance Criteria: "each report tab's summary shows a comparison against the
  previous month (delta value and/or percentage)".
- New tests (one per report): `test_net_worth_month_mode_change_vs_previous_month`,
  `test_income_expenses_month_mode_change_vs_previous_month`,
  `test_cash_flow_month_mode_change_vs_previous_month`, plus one covering the no-previous-data
  edge case.
- Non-month-mode summary calculations for all three reports are unchanged (verified by existing
  tests still passing).

## Notes

This task assumes T1 and T2 have already threaded `anchor_month` through all three functions —
it only adds the comparison logic on top.
