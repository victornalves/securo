# T1 — A status scope on the shared P&L predicates

| Field      | Value |
| ---------- | ----- |
| Task       | T1    |
| Feature    | 004   |
| Status     | Done  |
| Depends on | —     |
| PR         |       |
| Jira       | —     |

## Description

Teach the shared filter fragments to select *one* transaction state on demand, without changing
what any existing caller gets.

## Implementation guidance

`_query_filters.counts_as_pnl` / `counts_as_user_pnl` currently take `include_planned: bool` and
splice in `Transaction.status != "planned"` unless it is set
(`backend/app/services/_query_filters.py:66-113`). Add an optional `planned_scope` that, when
given, *overrides* that boolean:

```python
def _status_terms(include_planned: bool, planned_scope: str | None) -> list:
    """Which transaction states an aggregation counts.

    `planned_scope` wins over `include_planned` when both are given — only the
    budget report passes it, and it needs each state on its own regardless of
    the user's preference (004/D2).
    """
    if planned_scope == "planned":
        return [Transaction.status == "planned"]
    if planned_scope == "realized":
        return [Transaction.status != "planned"]
    if planned_scope is not None:
        raise ValueError(f"unknown planned_scope: {planned_scope!r}")
    return [] if include_planned else [Transaction.status != "planned"]
```

Then `counts_as_pnl(include_planned=False, planned_scope=None)` splices
`*_status_terms(include_planned, planned_scope)` where it currently inlines the conditional
list, and `counts_as_user_pnl` forwards both arguments through to it.

Same treatment for the two helpers that forward the preference into a single `counts_as_*` call
— each is a one-line change plus the new parameter:

- `owner_split_offset_by_category` (`_query_filters.py:223`) → `counts_as_user_pnl(include_planned, planned_scope)`
- `viewer_shared_spending_by_category` (`_query_filters.py:389`) → `counts_as_pnl(include_planned, planned_scope)`

Also add it to `owner_split_offset_pnl` if it forwards the same way, so the family stays
consistent.

**The default matters.** `planned_scope=None` must reproduce today's SQL exactly — that is what
keeps `/budgets`, the dashboard and per-account stats untouched, and it is why the parameter is
additive rather than a replacement for `include_planned`. Keep the docstring note that
`include_planned` defaults to `False` so an un-updated call site under-reports rather than
counting a commitment as spent.

Do not touch `is_realized()` or `counts_as_realized()` — balances stay as they are (spec
constraints).

## Files affected

- `backend/app/services/_query_filters.py`
- `backend/tests/`

## Done when

The three scopes produce the expected SQL predicates, and a test asserts that omitting
`planned_scope` leaves the compiled filter identical to the current one in both
`include_planned` states.

Verified by: unit tests over `counts_as_pnl` / `counts_as_user_pnl` for each scope, plus one
test asserting `ValueError` on an unknown scope.

## Notes

**Outcome.** `PLANNED_SCOPES` + `_status_terms(include_planned, planned_scope)` added to
`_query_filters.py`; `counts_as_pnl` / `counts_as_user_pnl` splice its terms. `planned_scope`
was added to all four async helpers in the family — `owner_split_offset_pnl`,
`owner_split_offset_by_category`, `viewer_shared_pnl`, `viewer_shared_spending_by_category` —
rather than only the two the report needs, so the family stays uniform; the two extra ones are
pure pass-through with a `None` default. Unknown scopes raise `ValueError`.
