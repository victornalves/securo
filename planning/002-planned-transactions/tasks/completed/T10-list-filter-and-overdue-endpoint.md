# T10 — Status list filter and overdue-planned endpoint

| Field      | Value |
| ---------- | ----- |
| Task       | T10   |
| Feature    | 002   |
| Status     | Done  |
| Depends on | T2    |
| PR         |       |
| Jira       | —     |

## Description

Let clients filter the transactions list by status, and expose planned entries whose date has passed
without promotion.

## Implementation guidance

**Status filter.** `backend/app/api/transactions.py` (list params at lines 80-105) currently offers
no `status` parameter, and neither does the filter bar. Add a repeatable query parameter; omitting it
returns all statuses, preserving current behavior.

```
GET /transactions?status=planned&status=posted
```

The filter is applied in `transaction_service` alongside the existing list filters (around lines 134,
162). `status` is already exposed as a sortable column at line 465.

**This is the D3 boundary and the most important constraint in this task.** The `include_planned`
preference must **never** reach a list query. The toggle governs computed figures; list visibility is
governed by this filter and nothing else. If a list result changes when the toggle flips, the
implementation is wrong.

**Overdue endpoint.**

```
GET /transactions/planned/overdue → { count: int, items: [TransactionRead] }
```

where `status == "planned" AND date < today`, scoped to the workspace like every other transaction
query. The count drives a badge (T13); the items drive the review list.

This endpoint is what makes the manual-reconciliation decision (D2) survivable. Because sync inserts
a second row rather than merging (T7), a forgotten planned entry double-counts whenever the toggle is
on — the spec calls this out explicitly. The overdue surface is what makes that state noticeable
instead of silent.

## Files affected

- `backend/app/api/transactions.py`
- `backend/app/services/transaction_service.py`
- `backend/tests/`

## Done when

Satisfies: *"The transactions list can be filtered by state (planned / pending / posted)"* and
*"Planned transactions whose date has passed and that were never promoted are surfaced as an
actionable overdue planned set with a count"* (API half).

Verified by: filtering by each status returns exactly the matching rows; omitting the parameter
returns all; combining statuses works. A dedicated test asserts list results are **identical** with
the toggle on and off — the D3 guard. The overdue endpoint returns only past-dated planned rows, and
excludes past-dated posted rows, future-dated planned rows, and rows from other workspaces.

## Notes

Frontend consumption is T12 (filter bar) and T13 (overdue surface).

**Outcome.** `GET /api/transactions?status=` (repeatable) and `GET /api/transactions/planned/overdue`.
The status filter lands in `get_transactions` as a `statuses` list alongside the other list filters;
the preference is not imported anywhere near that code path.

**Design call worth recording:** the overdue endpoint pins `accounting_mode="cash"` instead of reading
the global setting. `to_date` filters on `reporting_date_col`, which under accrual resolves to a
credit-card row's *bill due date* — so a planned purchase would only look overdue once its invoice
came due, weeks after the user expected to confirm it. Overdue-ness is about the commitment date the
user entered, not the cycle it settles in. Commented at the call site.

Eight tests in `tests/test_planned_transactions_list.py`, including the D3 guard: list contents and
`total` are identical with the preference on and off. Overdue excludes today (a commitment due today
has not been missed), ignores non-planned rows, and is workspace-scoped.

Full suite green — 2444 passed, 7 skipped. Ruff clean.
