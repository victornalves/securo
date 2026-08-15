# T4 — Backend: `/api/reports/bounds` endpoint (earliest navigable month)

| Field      | Value      |
| ---------- | ---------- |
| Task       | T4         |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | —          |
| PR         | —          |
| Jira       | —          |

## Description

Add a new endpoint that reports the workspace's earliest transaction month, so the frontend can
cap how far back the month selector navigates.

## Implementation guidance

From `plan.md` ADR "new `/api/reports/bounds` endpoint for the earliest navigable month":

- Extract the earliest-transaction query already inlined in `_get_baseline_projection`
  (`report_service.py` lines ~1037-1049) into a standalone function:

  ```python
  async def get_earliest_transaction_month(session, workspace_id) -> str | None:
      result = await session.execute(
          select(func.min(Transaction.date))
          .join(Account, Transaction.account_id == Account.id)
          .where(
              Transaction.workspace_id == workspace_id,
              Account.is_closed == False,
              Transaction.source != "opening_balance",
              counts_as_pnl(),
          )
      )
      earliest = result.scalar_one_or_none()
      return earliest.strftime("%Y-%m") if earliest else None
  ```

  Update `_get_baseline_projection` to call this shared function instead of its inline query.
- Add `ReportBoundsResponse` to `backend/app/schemas/report.py`:

  ```python
  class ReportBoundsResponse(BaseModel):
      earliest_month: str | None
  ```

- Add the route in `backend/app/api/reports.py`:

  ```python
  @router.get("/bounds", response_model=ReportBoundsResponse)
  async def get_report_bounds(
      ctx: WorkspaceContext = Depends(current_workspace),
      session: AsyncSession = Depends(get_async_session),
  ):
      earliest = await get_earliest_transaction_month(session, ctx.workspace_id)
      return ReportBoundsResponse(earliest_month=earliest)
  ```

## Files affected

- `backend/app/api/reports.py`
- `backend/app/services/report_service.py`
- `backend/app/schemas/report.py`
- `backend/tests/test_report_service.py`

## Done when

- Satisfies spec Acceptance Criteria: "The month selector allows navigating back to the month of
  the workspace's earliest transaction, and no further."
- New tests: `test_reports_bounds_endpoint_returns_earliest_month` (seeded transactions) and
  `test_reports_bounds_endpoint_no_transactions` (returns `earliest_month: null`).
- `_get_baseline_projection`'s existing behavior is unchanged after the extraction (existing
  baseline tests still pass).

## Notes

Independent of T1-T3 — can be worked in parallel with those, since it doesn't touch the
`anchor_month` code paths.
