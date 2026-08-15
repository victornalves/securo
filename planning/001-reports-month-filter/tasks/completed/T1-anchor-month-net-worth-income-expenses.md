# T1 — Backend: `anchor_month` support for net-worth and income-expenses

| Field      | Value      |
| ---------- | ---------- |
| Task       | T1         |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | —          |
| PR         | —          |
| Jira       | —          |

## Description

Add an optional `anchor_month` query param (`YYYY-MM`) to `GET /api/reports/net-worth` and
`GET /api/reports/income-expenses`. When present, the report is scoped to that exact calendar
month instead of the usual rolling window ending today.

## Implementation guidance

From `plan.md` → "Architecture & Components" and ADR "single `anchor_month` param, mutually
exclusive with rolling-window params":

- `backend/app/api/reports.py`: add `anchor_month: str | None = Query(None, pattern="^\d{4}-\d{2}$")`
  to `get_net_worth` (lines ~15-28) and `get_income_expenses` (lines ~31-45).
- `backend/app/services/report_service.py`: add a new helper

  ```python
  def _month_bounds(anchor_month: str) -> tuple[date, date]:
      year, month = map(int, anchor_month.split("-"))
      start = date(year, month, 1)
      end = start.replace(day=calendar.monthrange(year, month)[1])
      return start, end
  ```

  Use it as an alternative to `_report_start_date` (lines 55-70) whenever `anchor_month` is set:
  when set, `start, end = _month_bounds(anchor_month)` and `end` is **not** `today` — every
  downstream computation in these two report functions that currently assumes `end == today`
  (trend point generation, summary "current" value) must read the resolved `end` instead.
- `months`/`period`/`days` are ignored when `anchor_month` is set (don't validate them against
  each other — just branch on `anchor_month is not None` first).
- Income-expenses' SQL-side interval grouping (`_interval_label_expr`, line 356) needs no change
  — it already groups by whatever `start`/`end` bound the query.

## Files affected

- `backend/app/api/reports.py`
- `backend/app/services/report_service.py`
- `backend/tests/test_report_service.py`
- `backend/tests/test_report_service_coverage.py`

## Done when

- Satisfies spec Acceptance Criteria: "Selecting a month shows that report's data scoped to
  that calendar month only", "the report backend accept[s] a way to anchor... to a specific
  past month", and "the existing rolling-window presets continue to work exactly as before".
- New tests: `test_net_worth_api_accepts_anchor_month`, `test_income_expenses_api_accepts_anchor_month`
  (seed fixed-date transactions, assert response scoped to that month, not `date.today()`).
- Existing `test_report_service.py`/`test_report_service_coverage.py` suites still pass
  unchanged (no regression to `months`/`period=ytd`/`days` behavior).
- A month with no transactions returns the existing empty/no-data shape, not a 500/error.

## Notes

Cash-flow is deliberately excluded from this task — its forecast/baseline logic is entangled
with `today` in ways the other two aren't; see T2.
