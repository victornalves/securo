# T3 — Backend tests: drill-down agrees with the dashboard

| Field      | Value |
| ---------- | ----- |
| Task       | T3    |
| Feature    | 006   |
| Status     | Done  |
| Depends on | T2    |
| PR         |       |
| Jira       | —     |

## Description

Cover both preference states, the explicit override, the composition with existing exclusions, and
the reconciliation that is the whole point of the spec.

## Implementation guidance

New file `backend/tests/test_planned_transactions_drill_down.py`, following the fixture style of
`backend/tests/test_planned_transactions_dashboard.py`:

- `_set_include_planned(session, user, value)` — copy-then-assign on `user.preferences`; SQLAlchemy
  does not track in-place mutation of a JSON dict.
- Dates on day 15 of the current month, to avoid month-boundary flakiness.
- A module-level `PLANNED_AMOUNT` so assertions can check the figure moved by *exactly* that amount
  — "the number changed" would also be satisfied by a double-counting bug.

Tests to write:

1. **Regression, preference off.** `GET /transactions?user_pnl_only=true` returns the realized row
   only. This is today's behaviour and must not change.
2. **Preference on.** Same request returns realized + planned; the row count rises by exactly one and
   the summed absolute amount by exactly `PLANNED_AMOUNT`.
3. **Override true, preference off** (the uncategorized drawer's path):
   `&pnl_include_planned=true` returns the planned row.
4. **Override false, preference on:** `&pnl_include_planned=false` excludes it.
5. **Composition with existing exclusions, preference on.** Planned rows are still excluded when
   they sit in a closed account, carry `is_ignored=True`, belong to a category flagged `is_ignored`
   or `treat_as_transfer`, or are a paired transfer leg. One planned row per exclusion.
6. **Reconciliation — the criterion that matters.** With the preference on, create realized and
   planned debits in one category, then assert
   `GET /dashboard/spending-by-category` for that category equals the summed absolute amounts from
   `GET /transactions?user_pnl_only=true&category_id=…&from=…&to=…`. Parametrise over both accounting
   modes (`cash`, `accrual`).
7. **The 002/D3 guarantee still holds for the navigable list.** `GET /transactions` *without*
   `user_pnl_only` returns byte-identical results in both preference states.

## Files affected

- `backend/tests/test_planned_transactions_drill_down.py` (new)

## Done when

`pytest backend/tests/test_planned_transactions_drill_down.py` passes, and the pre-existing
`test_transactions_api.py::test_list_transactions_user_pnl_only` and the spec 002 suites still pass
unchanged.

## Notes

**Pre-existing failures, unrelated to this task.** Three tests in the spec 002 suites fail on a pristine HEAD as well — verified by reverting both files and re-running: `test_planned_transactions_reports.py::test_account_summary_respects_preference` and `test_planned_transactions_coverage.py::test_per_account_stats[cash|accrual]`. All three are on `/api/accounts/{id}/summary` and per-account stats, which never call `user_pnl_only`. Worth its own Bug spec.

Test 6 is the one that would have caught the original defect. If it is hard to write, that is a
signal the reconciliation is not actually exact — investigate rather than loosening the assertion.
