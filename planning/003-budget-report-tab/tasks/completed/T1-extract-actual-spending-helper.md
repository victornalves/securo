# T1 — Extract the actual-spending computation into a window helper

| Field      | Value |
| ---------- | ----- |
| Task       | T1    |
| Feature    | 003   |
| Status     | Done  |
| Depends on | —     |
| PR         | 10b467b (local) |
| Jira       | —     |

## Description

Pure, behaviour-preserving refactor. `budget_service.get_budget_vs_actual` currently computes
realized spending twice inline — once for the requested month, once for the previous month —
in five ordered steps. Extract those steps into a single helper parameterized by an arbitrary
`(start, end)` window, and rewrite `get_budget_vs_actual` as two calls to it.

Nothing about `/budgets`, the dashboard, or the MCP budget tools may change. This task ships no
new behaviour; it exists so that T2 can compute realized spending over a multi-month window
using the *same code path* as `/budgets`, which is what makes the spec's cent-level parity
requirement hold by construction instead of by care.

## Implementation guidance

The five steps, in the order they appear today in `get_budget_vs_actual` (this order matters —
preserve it exactly):

1. `SELECT category_id, SUM(coalesce(amount_primary, amount))` over `Transaction` filtered by
   `workspace_id`, `type == "debit"`, `reporting_date_col(accounting_mode)` within the window,
   `category_id.isnot(None)`, and `counts_as_user_pnl()`; grouped by `category_id`; each total
   stored as `abs(...)`.
2. Subtract `owner_split_offset_by_category(...)` per category, **popping the entry when the
   result is `<= 0`** (the current code does this — keep it).
3. Add `viewer_shared_spending_by_category(...)` per category.
4. Add `_get_recurring_projections(...)`, skipping non-debit and category-less projections, each
   amount FX-converted via `convert(...)` to the primary currency.

Both split helpers take `use_effective_date=accounting_mode == "accrual"` and
`primary_currency`; `owner_split_offset_by_category` also takes `workspace_id`.

Target signature:

```python
async def _actual_spending_by_category(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    start: date,            # inclusive
    end: date,              # exclusive, matching today's month_start/month_end convention
    primary_currency: str,
    accounting_mode: str,
    include_uncategorized: bool = False,
) -> dict[str | None, Decimal]:
    ...
```

`include_uncategorized` is the one addition beyond pure extraction: when `True`, drop the
`category_id.isnot(None)` filter in step 1 and key the null bucket under `None` (steps 2–4
already return `None` keys for category-less rows and are skipped today — keep skipping them
when the flag is `False`). `/budgets` keeps calling with the default `False`, so its behaviour
is untouched. T2 needs `True` for the out-of-budget column.

`get_budget_vs_actual` then reduces to:

```python
spending_map = await _actual_spending_by_category(
    session, workspace_id, user_id, month_start, month_end,
    primary_currency, accounting_mode,
)
prev_spending_map = await _actual_spending_by_category(
    session, workspace_id, user_id, prev_month_start, prev_month_end,
    primary_currency, accounting_mode,
)
```

with the rest of the function (category listing, `_build_budget_map`, percentage, sorting)
unchanged.

Move the local `from app.services._query_filters import viewer_shared_spending_by_category`
import to the module header while you are here — it is a leftover inline import.

## Files affected

- `backend/app/services/budget_service.py`

## Done when

- `_actual_spending_by_category` exists with the signature above and `get_budget_vs_actual`
  contains no inline spending aggregation.
- `backend/tests/test_budget_service.py` and `backend/tests/test_budgets_api.py` pass
  **unmodified**. Needing to edit either file means the extraction changed behaviour — stop and
  re-examine rather than adjusting the test.
- `backend/mcp_server/tools/budgets.py` reviewed for direct dependence on the removed inline
  code (it consumes `get_budget_vs_actual`, whose signature and return type do not change).
- Ruff clean.

Supports the spec's parity criteria (Realized/Budgeted match `/budgets` to the cent) by making
them structural.

## Notes

Land this on its own — a refactor commit mixed with new behaviour is unreviewable, and this one
sits under three consumers (`/budgets`, dashboard, MCP tools).
