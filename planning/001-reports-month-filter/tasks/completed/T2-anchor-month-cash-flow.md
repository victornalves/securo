# T2 — Backend: `anchor_month` support for cash-flow (forecast/baseline disabled)

| Field      | Value      |
| ---------- | ---------- |
| Task       | T2         |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | T1         |
| PR         | —          |
| Jira       | —          |

## Description

Add `anchor_month` support to `GET /api/reports/cash-flow`. Unlike net-worth/income-expenses,
cash-flow is structurally a "past actuals + forward forecast from today" report — in month mode
it becomes a purely historical view of that one month, with forecasting and baseline projection
turned off entirely.

## Implementation guidance

From `plan.md` ADR "cash-flow month mode drops forecast/baseline entirely":

- `backend/app/api/reports.py`: add the same `anchor_month: str | None` param to `get_cash_flow`
  (lines ~48-60), reusing `_month_bounds()` from T1.
- `backend/app/services/report_service.py`, cash-flow's date-range logic (currently lines ~1147-1149:
  `end = _add_months(today, months)`, `chart_start = _add_months(today, -_PAST_HISTORY_MONTHS)`):
  when `anchor_month` is set, replace both with `chart_start, end = _month_bounds(anchor_month)`
  and skip the forecast-boundary computation (`forecast_start_date` in meta, lines ~1467-1474) —
  set it to `None`.
- Ignore the `baseline` query param when `anchor_month` is set (treat as `False` regardless of
  what the client sent) — don't call the baseline projection code path at all.
- The daily-actuals walk (`daily_balance`, lines ~1337-1344) already works off explicit
  `chart_start`/`end` bounds — it should work unmodified once those are set to the month bounds,
  since the entanglement with `today` is specifically in the forecast/baseline code, not the
  actuals walk.
- Response: `meta.forecast_start_date = null`, `meta.baseline_active = false` always in this mode,
  regardless of the `baseline` param's value.

## Files affected

- `backend/app/api/reports.py`
- `backend/app/services/report_service.py`
- `backend/tests/test_report_service.py`
- `backend/tests/test_report_service_coverage.py`

## Done when

- Satisfies spec Acceptance Criteria: cash-flow scoped to the selected month; rolling-window
  cash-flow behavior (forecast, baseline) unchanged when `anchor_month` is absent.
- New test: `test_cash_flow_api_accepts_anchor_month_disables_forecast` — asserts
  `meta.forecast_start_date is None` and `meta.baseline_active is False` even when
  `baseline=true` is passed alongside `anchor_month`.
- Existing cash-flow tests (forecast, baseline mode) still pass unchanged.

## Notes

This is the most invasive of the three report functions per the plan's risk assessment — keep
the default (no `anchor_month`) code path completely untouched; the new behavior must be reached
only through a new, clearly separated branch.
