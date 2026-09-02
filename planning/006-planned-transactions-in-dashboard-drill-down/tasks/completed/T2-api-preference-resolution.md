# T2 — Resolve the preference at the API boundary

| Field      | Value |
| ---------- | ----- |
| Task       | T2    |
| Feature    | 006   |
| Status     | Done  |
| Depends on | T1    |
| PR         |       |
| Jira       | —     |

## Description

Expose `pnl_include_planned` on `GET /api/transactions` as a tri-state parameter that defaults to the
caller's *include planned* preference.

## Implementation guidance

Every other computed-figure site in Securo reads the preference server-side
(`dashboard_service`, `report_service`, `budget_service` all call `user.include_planned`). This
endpoint follows that convention rather than having the client transmit it.

Add the query parameter next to `user_pnl_only` (`backend/app/api/transactions.py:101`):

```python
    user_pnl_only: bool = Query(False, description="Return only rows that count toward dashboard/user income/expense totals (the definition includes planned rows when the caller's include-planned preference is on)"),
    pnl_include_planned: Optional[bool] = Query(
        None,
        description=(
            "Only meaningful with user_pnl_only. Omitted: use the caller's "
            "include-planned preference. true/false: override it."
        ),
    ),
```

and resolve it when calling the service (`api/transactions.py:119`):

```python
        user_pnl_only=user_pnl_only,
        pnl_include_planned=(
            ctx.user.include_planned
            if pnl_include_planned is None
            else pnl_include_planned
        ),
```

`ctx.user` is a `User` model instance and `User.include_planned` is the property reading
`preferences["include_planned"]` (`backend/app/models/user.py:49`), so no extra query is needed.

**Why tri-state rather than an unconditional server-side read.** Spec D3 requires the uncategorized
drill-down to include planned rows in *both* preference states — it explains a status-agnostic
worklist count, not a P&L figure. An unconditional read cannot express that; the explicit `true` from
that one caller can.

The parameter is harmless without `user_pnl_only`: the service only consults it inside that branch.

## Files affected

- `backend/app/api/transactions.py`

## Done when

`GET /transactions?user_pnl_only=true` returns planned rows for a user whose preference is on and
omits them for a user whose preference is off; `&pnl_include_planned=true` forces inclusion and
`=false` forces exclusion regardless of the preference. Verified by T3.

## Notes

`export_transactions` is a separate endpoint and is deliberately not given the parameter — CSV export
scope for planned rows is an unresolved question carried over from spec 002.
