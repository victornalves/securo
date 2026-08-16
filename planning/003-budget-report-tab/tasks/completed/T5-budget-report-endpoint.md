# T5 — `GET /api/reports/budget`

| Field      | Value |
| ---------- | ----- |
| Task       | T5    |
| Feature    | 003   |
| Status     | Done  |
| Depends on | T4    |
| PR         | 5ac584c (local) |
| Jira       | —     |

## Description

Expose the budget report through the reports router, with the same parameter shape and
validation as its sibling endpoints.

## Implementation guidance

Add to `backend/app/api/reports.py`, next to the existing routes:

```python
@router.get("/budget", response_model=BudgetReportResponse)
async def get_budget_report(
    months: int = Query(12, ge=1, le=24),
    period: str | None = Query(None, pattern="^ytd$"),
    anchor_month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    return await report_service.get_budget_report(
        session, ctx.workspace.id, ctx.user_id, months, ctx.user.primary_currency,
        period=period, anchor_month=anchor_month,
    )
```

Deliberately absent parameters, each for a reason worth not rediscovering later:

- **`account_ids`** — budgets have no account dimension. The frontend gates the whole tab when a
  Collection is active (T10) rather than filtering one side of the comparison.
- **`interval`** — the chart has categories on the X axis, not time.
- **`days`** — the exact-rolling-window escape hatch belongs to the Money Map.

Import `BudgetReportResponse` alongside the existing `ReportBoundsResponse` / `ReportResponse`.
Place the route before or after `/bounds` — order is irrelevant here since none of these paths
are ambiguous with a path parameter.

## Files affected

- `backend/app/api/reports.py`

## Done when

- `GET /api/reports/budget` responds 200 with the documented shape for a workspace with budgets.
- `anchor_month=2026-13` and `anchor_month=garbage` are rejected with 422 by the pattern.
- `months=0` and `months=25` are rejected with 422.
- Ruff clean. Covered by tests in T6.
