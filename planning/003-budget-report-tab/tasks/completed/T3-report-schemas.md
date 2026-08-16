# T3 — Budget report response schemas

| Field      | Value |
| ---------- | ----- |
| Task       | T3    |
| Feature    | 003   |
| Status     | Done  |
| Depends on | —     |
| PR         | 5ac584c (local) |
| Jira       | —     |

## Description

Add the Pydantic schemas for the budget report response. Separate from `ReportResponse`, which
is time-series shaped and does not fit a chart whose X axis is categories.

## Implementation guidance

Append to `backend/app/schemas/report.py`, alongside the existing report schemas:

```python
class BudgetReportRow(BaseModel):
    category_id: uuid.UUID
    category_name: str
    category_icon: str
    category_color: str
    group_name: str | None = None
    budgeted: float          # sum of each month's effective envelope in the window
    realized: float          # spending over the window, /budgets semantics
    difference: float        # budgeted - realized; positive = room left
    percentage_used: float | None   # realized / budgeted * 100; None when budgeted == 0
    months_in_window: int
    months_budgeted: int


class BudgetReportSummary(BaseModel):
    budgeted: float
    realized: float          # budgeted categories only
    balance: float           # budgeted - realized
    out_of_budget: float


class BudgetReportMeta(BaseModel):
    currency: str
    start_date: str          # YYYY-MM-DD, inclusive
    end_date: str            # YYYY-MM-DD, inclusive
    months_in_window: int
    anchor_month: str | None


class BudgetReportResponse(BaseModel):
    rows: list[BudgetReportRow]
    summary: BudgetReportSummary
    meta: BudgetReportMeta
```

`difference` follows the dashboard Budget Balance sign convention — positive means room left,
negative means overspent — so the frontend colours both the same way without inverting anything.

The module currently imports only `BaseModel`; add the `uuid` import.

Floats (not `Decimal`) match every other report schema in this file, and the existing
`BudgetVsActual` schema is the one place `Decimal` is used — do not follow it here, follow the
report file's own convention.

## Files affected

- `backend/app/schemas/report.py`

## Done when

The four schemas exist and import cleanly; Ruff clean. Verified in use by T4/T5.
