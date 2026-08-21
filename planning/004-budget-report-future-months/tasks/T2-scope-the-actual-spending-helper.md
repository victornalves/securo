# T2 — Scope `_actual_spending_by_category`, and drop future projections

| Field      | Value |
| ---------- | ----- |
| Task       | T2    |
| Feature    | 004   |
| Status     | Todo  |
| Depends on | T1    |
| PR         |       |
| Jira       | —     |

## Description

Plumb the status scope through the single definition of "actual", and apply spec D3: virtual
recurring occurrences dated after today count nowhere.

## Implementation guidance

`_actual_spending_by_category` (`backend/app/services/budget_service.py:222-316`) runs four
ordered steps. Add `planned_scope: str | None = None` and thread it through all of them:

1. **Debits** — `counts_as_user_pnl(include_planned, planned_scope)` in the conditions list.
2. **Own-split offsets** — `owner_split_offset_by_category(..., planned_scope=planned_scope)`.
3. **Viewer shared spending** — `viewer_shared_spending_by_category(..., planned_scope=planned_scope)`.
4. **Recurring projections** — the D3 rule:

```python
# Only recorded commitments count in a future window (004/D3): a projection is
# a forecast, not a decision the user made. Occurrences dated on or before today
# still count, or rules with auto_generate=false — which are projected instead of
# materialized — would lose their past spending and this helper would stop
# agreeing with /budgets on past months.
if planned_scope != "planned":
    projections = await _get_recurring_projections(session, workspace_id, start, end)
    for proj in projections:
        if planned_scope == "realized" and proj["date"] > date.today():
            continue
        ...  # unchanged body
```

`_get_recurring_projections` already returns a `date` key on every dict
(`backend/app/services/dashboard_service.py:90-96`), so no signature change is needed there and
the dashboard is unaffected.

With `planned_scope=None` every step must behave exactly as it does today, including the
unfiltered projection loop — `get_budget_vs_actual` and the dashboard depend on it.

Note the interaction to preserve in step 2: it *subtracts* non-owner shares and pops a category
when the result reaches zero. Each scope runs its own pass, so the pops are per-scope and need
no special handling — just don't share state between passes.

## Files affected

- `backend/app/services/budget_service.py`
- `backend/tests/`

## Done when

Satisfies the spec's *"`realized` counts only transactions whose status is not `planned`"*,
*"`planned` counts transactions whose status is `planned`"*, and the whole **Recurring
occurrences** block.

Verified by: for the same window, the `"realized"` and `"planned"` passes partition what the
`None` pass returns with `include_planned=True`, *except* for projections dated after today,
which appear only in the `None` pass. One test per row of that statement.
