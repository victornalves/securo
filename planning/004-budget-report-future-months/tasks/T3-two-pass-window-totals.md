# T3 — Two-pass window totals, and stop reading the preference

| Field      | Value |
| ---------- | ----- |
| Task       | T3    |
| Feature    | 004   |
| Status     | Todo  |
| Depends on | T2    |
| PR         |       |
| Jira       | —     |

## Description

Return realized and planned as separate quantities per category, and make the budget report a
pure function of (workspace, window) by removing the `include_planned` read.

## Implementation guidance

In `get_budget_window_totals` (`backend/app/services/budget_service.py:420-496`):

- `CategoryWindowTotals` gains `planned: Decimal` next to `realized`.
- Replace the single spending call — which today passes
  `include_planned=user.include_planned if user else False` — with two scoped calls:

```python
realized_map = await _actual_spending_by_category(
    session, workspace_id, user_id, start, end,
    primary_currency, accounting_mode,
    include_uncategorized=True, planned_scope="realized",
)
planned_map = await _actual_spending_by_category(
    session, workspace_id, user_id, start, end,
    primary_currency, accounting_mode,
    include_uncategorized=True, planned_scope="planned",
)
```

- The preference is no longer read here at all (004/D2 — the toggle becomes a presentation
  concern). `user` is still needed for `primary_currency`; drop only the `include_planned`
  expression.
- `budgeted_ids` is unchanged: a category earns a slot when its envelopes over the window sum
  above zero. A category with only planned spending and no envelope still goes out-of-budget.
- Out-of-budget is now two totals, one per map, and the return type becomes
  `tuple[list[CategoryWindowTotals], Decimal, Decimal]` →
  `(rows, out_of_budget_realized, out_of_budget_planned)`. Update the docstring accordingly.
- The early return when there are no budgeted categories returns `[], oob_realized, oob_planned`.

Keep the comment explaining why `_build_budget_map` is looped per month rather than
reimplemented — it is still the reason the envelope side agrees with `/budgets`.

## Files affected

- `backend/app/services/budget_service.py`
- `backend/tests/`

## Done when

Satisfies *"`BudgetReportRow` carries `realized` and `planned` as separate figures"* (service
half) and *"the same assertions with `include_planned` true and false → identical response"*.

Verified by: a test that flips the user's `include_planned` preference and asserts the returned
totals are byte-identical, and a test that a planned-only unbudgeted category lands in
`out_of_budget_planned` and not in `rows`.
