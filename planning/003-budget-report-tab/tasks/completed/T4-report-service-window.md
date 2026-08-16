# T4 — `report_service.get_budget_report`: window resolution and assembly

| Field      | Value  |
| ---------- | ------ |
| Task       | T4     |
| Feature    | 003    |
| Status     | Done  |
| Depends on | T2, T3 |
| PR         | 5ac584c (local) |
| Jira       | —      |

## Description

Translate the report screen's period parameters into a month-aligned window, enumerate the
months inside it, delegate the numbers to `budget_service.get_budget_window_totals`, and
assemble the `BudgetReportResponse`.

## Implementation guidance

```python
async def get_budget_report(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    months: int,
    primary_currency: str,
    period: str | None = None,
    anchor_month: str | None = None,
) -> BudgetReportResponse:
```

**Window resolution** — reuse this module's existing helpers, exactly as the other three report
functions do, so "6M" means the same thing on every tab:

- `anchor_month` set → `start, end_inclusive = _month_bounds(anchor_month)`.
- otherwise → `start = _report_start_date(today, months, period)`, `end_inclusive = today`.

There is no `days` parameter on this tab (that is the Money Map's 30-day window).

**Month enumeration — the trap.** Derive the month list from the *resolved start date*, not
from the `months` argument:

```python
months_list = []
m = start.replace(day=1)
last = end_inclusive.replace(day=1)
while m <= last:
    months_list.append(m)
    m = _add_months(m, 1)
```

`_report_start_date` approximates a month as 30 days before snapping to day 1, so a `months=6`
request can legitimately span seven calendar months. Using the count would make the envelope
total cover a different span than the spending total — the two bars would stop being comparable.
`_add_months` already exists in this module.

**Spending bounds.** `budget_service` follows a half-open `[start, end)` convention, so pass
`end = end_inclusive + timedelta(days=1)`. The current (partial) month contributes its full
envelope and its partial spending — no pro-rating, per the spec's non-goal.

**Assembly.**

- Sort rows by `realized` descending (the out-of-budget column is not a row; the frontend
  appends it last).
- `difference = budgeted - realized`, `percentage_used` as computed in T2.
- `months_in_window = len(months_list)` on every row.
- `summary.budgeted` / `summary.realized` sum over rows only; `summary.balance = budgeted -
  realized`; `summary.out_of_budget` is the second return value from T2.
- `meta.start_date` / `meta.end_date` as `YYYY-MM-DD` strings of the inclusive window;
  `meta.anchor_month` echoes the input.

Keep budget math out of this function — envelopes and actuals belong to `budget_service`
(plan ADR: window resolution here, budget math there).

## Files affected

- `backend/app/services/report_service.py`

## Done when

- `anchor_month="2026-03"` produces a window of exactly March 2026 with `months_in_window == 1`.
- `period="ytd"` starts on 1 January of the current year.
- A `months=6` request whose resolved start spans seven calendar months yields
  `months_in_window == 7`, and the envelope sum covers those same seven months.
- Rows are ordered by `realized` descending.
- Ruff clean. Covered by tests in T6.
