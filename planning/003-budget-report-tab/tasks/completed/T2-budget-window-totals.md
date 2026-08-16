# T2 — Aggregate envelopes and actuals over a window

| Field      | Value |
| ---------- | ----- |
| Task       | T2    |
| Feature    | 003   |
| Status     | Done  |
| Depends on | T1    |
| PR         | 0c934cf (local) |
| Jira       | —     |

## Description

Add the budget-side aggregation this report needs: given a month-aligned window, sum each
category's effective envelope month by month, compute realized spending once over the whole
window, and split the result into budgeted-category rows plus a single out-of-budget total.

## Implementation guidance

New public function in `budget_service`:

```python
async def get_budget_window_totals(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    months: list[date],     # first-of-month dates, ascending, every month in the window
    start: date,            # inclusive — first day of months[0]
    end: date,              # exclusive — first day of the month after months[-1]
) -> tuple[list[CategoryWindowTotals], Decimal]:
```

returning the per-category totals and the out-of-budget sum. `months` is passed in rather than
derived here: the caller (T4) owns window semantics, and the month list must come from the
resolved start date, never from a month count (see T4).

**Envelopes.** Loop `_build_budget_map(session, workspace_id, m)` for each `m` in `months`,
accumulating per category:

- `budgeted` — running sum of the resolved amounts
- `months_budgeted` — count of months where an envelope resolved with amount `> 0`

Do **not** reimplement the override-beats-recurring resolution rule; calling the existing
function per month is the deliberate choice (at most 24 iterations, exactly one in month mode).
The bulk-fetch optimization is explicitly deferred — see the plan's ADR.

**Actuals.** One call to `_actual_spending_by_category(..., start, end,
include_uncategorized=True)` from T1. Not a per-month loop.

**Split.** A category is a row when its summed `budgeted > 0`. Everything else — categories
never budgeted in the window, categories whose envelopes summed to exactly 0, and the `None`
(uncategorized) key — is added to the out-of-budget total. This window-level membership rule is
what the spec's "a month with no envelope counts as 0" decision implies: a category with any
envelope in the window carries *all* of its window spending, and no spending is ever split
between a row and the out-of-budget bucket.

Categories with `budgeted > 0` and zero spending must still be returned as rows with
`realized = 0` (budgeted-but-unspent categories are visible by design).

Fetch category metadata (name, icon, color, group name) with the existing
`select(Category, CategoryGroup).outerjoin(...)` pattern from `get_budget_vs_actual`.

`percentage_used = round(float(realized / budgeted * 100), 1)`, guarded for `budgeted == 0`
exactly as `get_budget_vs_actual` guards it.

Use a small dataclass or a Pydantic model for `CategoryWindowTotals` carrying: `category_id`,
`category_name`, `category_icon`, `category_color`, `group_name`, `budgeted`, `realized`,
`months_budgeted`. Ordering is the caller's concern (T4).

## Files affected

- `backend/app/services/budget_service.py`

## Done when

- The function returns rows for every category with `budgeted > 0` over the window, and a single
  out-of-budget Decimal covering everything else including uncategorized spending.
- A category budgeted in 3 of 6 months returns `budgeted` = sum of those 3, `months_budgeted = 3`,
  and `realized` covering all 6 months.
- Realized for a single-month window equals what `get_budget_vs_actual` reports for that month.
- Ruff clean. Covered by tests in T6.

Satisfies the spec criteria on multi-month aggregation, row membership, zero-spend budgeted
categories, and the out-of-budget bucket.
