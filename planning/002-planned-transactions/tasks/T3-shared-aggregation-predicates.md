# T3 — Shared aggregation predicates

| Field      | Value |
| ---------- | ----- |
| Task       | T3    |
| Feature    | 002   |
| Status     | Todo  |
| Depends on | T2    |
| PR         |       |
| Jira       | —     |

## Description

Teach `_query_filters` about the planned status: a predicate that always excludes it, and an opt-in
parameter for the aggregates the toggle governs. This is the single place the rule lives; every
consumer arrives in T4–T6 and T9.

## Implementation guidance

`backend/app/services/_query_filters.py`. Its docstring already states the intent — *"Centralizes the
'what counts as real income/expense' definition so every aggregation site agrees. Changes to the rule
only need to be made here."* — but `status` is currently absent from the file entirely. This task
makes good on that promise.

```python
def counts_as_realized():
    """Excludes planned rows. For balances and anything describing what already happened."""
    return and_(counts_as_pnl(), Transaction.status != "planned")

def counts_as_pnl(include_planned: bool = False): ...
def counts_as_user_pnl(include_planned: bool = False): ...
```

When `include_planned` is `False`, add `Transaction.status != "planned"` to the returned `and_`.
`counts_as_user_pnl` composes `counts_as_pnl` (line 91-94) — thread the flag through rather than
duplicating the predicate.

**The default must be `False`.** Any call site not yet migrated then keeps excluding planned, which
is the safe direction: a missed site under-reports rather than silently counting a future commitment
as spent.

Also thread `include_planned` through the four split-offset helpers in this file, which each build
their own `where` clause and call `counts_as_pnl()` / `counts_as_user_pnl()` internally:
`owner_split_offset_pnl` (line 97), `owner_split_offset_by_category` (190), `viewer_shared_pnl` (261),
`viewer_shared_spending_by_category` (354).

Per the plan's ADR, the flag is passed explicitly — `_query_filters` must not read the preference
itself. These are pure filter builders; giving them a session lookup would make them do I/O and hide
the dependency. The preference is read at the API boundary in T4.

Do not touch `reporting_date_col` (line 18) — which date column is bucketed on is orthogonal to
whether a row counts at all.

## Files affected

- `backend/app/services/_query_filters.py`
- `backend/tests/`

## Done when

Delivers the mechanism behind *"Planned transactions are excluded from every aggregate by an explicit
status predicate, not by relying on a date bound."*

Verified by unit tests over a seeded set with one row of each status: `counts_as_realized()` admits
posted and pending only; `counts_as_pnl()` with the default excludes planned; with
`include_planned=True` admits it. Assert the existing exclusions (`transfer_pair_id`, `is_ignored`,
`treat_as_transfer` categories, settlement debits) still behave identically in every combination —
the status axis must compose with them, not replace them.

## Notes

Nothing consumes these yet, so this task changes no observable behavior. That is intentional: it
keeps the mechanism reviewable separately from the fourteen call sites that adopt it.
