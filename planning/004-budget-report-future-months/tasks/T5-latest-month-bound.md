# T5 — `latest_month` on `/reports/bounds`

| Field      | Value |
| ---------- | ----- |
| Task       | T5    |
| Feature    | 004   |
| Status     | Todo  |
| Depends on | —     |
| PR         |       |
| Jira       | —     |

## Description

Expose how far forward the Budget tab may navigate: the user's furthest recorded commitment,
floored at the current month and capped at +12 (spec D4).

## Implementation guidance

New helper in `report_service`, next to `get_earliest_transaction_month`
(`backend/app/services/report_service.py:1097-1102`):

```python
_MAX_FORWARD_MONTHS = 12

async def get_latest_planned_month(session, workspace_id) -> str:
    """Furthest month the Budget tab may navigate to, as `YYYY-MM`.

    Bucketed by `reporting_date_col`, not by raw `date`: a planned card
    instalment is reported in its bill month, and a bound taken from the
    purchase date could exclude the very row that made the month reachable.
    """
```

- `accounting_mode = await get_credit_card_accounting_mode(session)` (from
  `app.services.admin_service`, the same import `budget_service` uses), then
  `report_date = reporting_date_col(accounting_mode)`.
- `select(func.max(report_date)).where(Transaction.workspace_id == workspace_id,
  counts_as_user_pnl(planned_scope="planned"))` — reusing the report's own predicate so a row
  that could never appear on the tab cannot extend the bound either.
- Clamp: `current = date.today().replace(day=1)`;
  `cap = _add_months(current, _MAX_FORWARD_MONTHS)` (`report_service.py:1066`);
  result month = `max(current, min(found_month, cap))`, and `current` when nothing is found.
  Return `"%Y-%m"`.

Then `ReportBoundsResponse` gains `latest_month: str` (never null — it always has the current
month as a floor), and `api/reports.py:51-57` fills it. `earliest_month` stays nullable and
untouched, so existing consumers are unaffected.

## Files affected

- `backend/app/services/report_service.py`
- `backend/app/schemas/report.py`
- `backend/app/api/reports.py`
- `backend/tests/`

## Done when

Satisfies the four `latest_month` criteria in the spec's **Forward navigation** block.

Verified by: no planned rows → current month; a planned row three months out → that month; one
30 months out → capped at +12; a planned credit-card row whose `effective_bill_date` falls in a
later month → the later month; an `is_ignored` planned row → does not extend the bound.
