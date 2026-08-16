# T4 — `include_planned` preference and dashboard aggregates

| Field      | Value  |
| ---------- | ------ |
| Task       | T4     |
| Feature    | 002    |
| Status     | Todo   |
| Depends on | T3     |
| PR         |        |
| Jira       | —      |

## Description

Add the user-level toggle and make it govern the dashboard's monthly totals, spending-by-category and
trends. First task where the toggle becomes observable.

## Implementation guidance

**Storage** — `User.preferences`, the JSON column at `backend/app/models/user.py:22`, already holding
`language`, `date_format`, `timezone`, `currency_display`, and exposed through `UserRead` /
`UserUpdate` (`backend/app/schemas/user.py:17,22,26`). No migration.

Read with a default of `False`, so absence means exclude:

```python
def include_planned(user) -> bool:
    return bool((user.preferences or {}).get("include_planned", False))
```

Writes must **copy then assign** — SQLAlchemy does not track in-place mutation of a JSON dict. Follow
the existing pattern at `backend/app/api/workspaces.py:148-150`:

```python
prefs = dict(user.preferences or {})
prefs["include_planned"] = value
user.preferences = prefs
```

Per the plan's ADR, this is deliberately *not* an `AppSetting`. That table backs
`credit_card_accounting_mode`, which is a global admin setting — the wrong scope for a per-user
reading preference.

**Consumers** — `backend/app/services/dashboard_service.py`. Read the preference at the API boundary
and thread it down; the service functions take it as a parameter, they do not look it up. Sites:

- monthly income/expenses — lines 130, 168-169
- split offsets / shared P&L — lines 187, 197, 309
- spending-by-category and trends — lines 543, 559, 704, 710

Each already calls `counts_as_pnl()` / `counts_as_user_pnl()` or one of the split-offset helpers;
pass `include_planned` through.

Leave `_account_balance_at` and `_daily_deltas` alone — they are T6, and balance is never
toggle-governed.

**Do not** let the preference reach any list query. D3 in the spec is explicit: the toggle changes
figures, never list membership.

## Files affected

- `backend/app/models/user.py` (default only, if the preferences default dict is extended)
- `backend/app/api/users.py` / wherever `UserUpdate` is applied
- `backend/app/api/dashboard.py`
- `backend/app/services/dashboard_service.py`
- `backend/tests/`

## Done when

Satisfies: *"A single user-level include planned setting controls whether planned amounts are folded
into dashboard totals, budget actuals, spending-by-category, and cash-flow projections"* (dashboard
portion) and *"The toggle's state persists across sessions."*

Verified by: seed one planned transaction; assert dashboard totals, spending-by-category and trends
each change by exactly its amount when the toggle flips, and are unchanged from `main` when off.
Assert the preference survives a round-trip through `PATCH /users/me` and that setting it does not
clobber the other preference keys — the copy-then-assign bug would show up here.

## Notes

Budgets, reports and per-account stats are T5. Split across two tasks because the dashboard sites
alone are eight call sites.
