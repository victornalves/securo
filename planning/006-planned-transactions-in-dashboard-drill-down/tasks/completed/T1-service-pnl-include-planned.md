# T1 — A planned-state argument on `user_pnl_only`

| Field      | Value |
| ---------- | ----- |
| Task       | T1    |
| Feature    | 006   |
| Status     | Done  |
| Depends on | —     |
| PR         |       |
| Jira       | —     |

## Description

Let `transaction_service.get_transactions` fold planned rows into the `user_pnl_only` predicate,
without touching the independent `statuses` visibility filter.

## Implementation guidance

`get_transactions` currently applies the P&L predicate with no argument
(`backend/app/services/transaction_service.py:253`):

```python
if user_pnl_only:
    base_query = base_query.where(Account.is_closed == False, counts_as_user_pnl())
```

`counts_as_user_pnl()` defaults `include_planned=False`, so the flag is permanently realized-only
even though it is documented as "rows that count toward dashboard/user income/expense totals" — a
definition that became preference-dependent in spec 002.

Add a keyword argument next to `user_pnl_only` (`transaction_service.py:119`):

```python
    user_pnl_only: bool = False,
    pnl_include_planned: bool = False,
    statuses: Optional[list[str]] = None,
```

and use it:

```python
if user_pnl_only:
    base_query = base_query.where(
        Account.is_closed == False, counts_as_user_pnl(pnl_include_planned)
    )
```

**The default stays `False`.** This layer sits below the one that knows *who* is asking, so it must
keep failing in the under-reporting direction, exactly like `counts_as_pnl`'s own default. The
preference is resolved one layer up, in T2.

Extend the `get_transactions` docstring to state that `pnl_include_planned` is meaningful only
together with `user_pnl_only`, and that it reaches the P&L predicate only — never row visibility.

**Update the comment guarding the `statuses` filter** (`transaction_service.py:258-260`), which
currently reads that the preference "must never reach this query — a list's contents are identical
in both preference states (spec D3)". That is still true of the axis it guards and false as a blanket
statement once this task lands. Rewrite it to name the two axes explicitly, e.g.:

```python
    # Visibility only — driven by the transactions filter, never by the
    # include-planned preference: /transactions returns the same rows in
    # both preference states (002/D3, still in force for the navigable list).
    # The preference reaches the *P&L predicate* above instead, via
    # pnl_include_planned, because a drill-down explains a computed figure
    # rather than letting the user browse (006/D1).
```

Do not touch `_query_filters.py` — `counts_as_user_pnl` already accepts the flag. Do not touch
`export_transactions`, which never passes `user_pnl_only`.

## Files affected

- `backend/app/services/transaction_service.py`

## Done when

`get_transactions(..., user_pnl_only=True, pnl_include_planned=True)` returns planned rows that pass
every other P&L exclusion, and the same call with `pnl_include_planned=False` (and with the argument
omitted) returns exactly what it returns today. Verified by T3.

## Notes

The only caller of `user_pnl_only` in the codebase is the dashboard drill-down drawer, which is what
makes changing its semantics safe. Say so in the docstring so a future caller inherits the contract
rather than the surprise.
