# T6 — Balance and balance-history status awareness

| Field      | Value  |
| ---------- | ------ |
| Task       | T6     |
| Feature    | 002    |
| Status     | Todo   |
| Depends on | T1, T3 |
| PR         |        |
| Jira       | —      |

## Description

Exclude planned rows from settled balance and make balance history distinguish settled days from
projected ones.

## Implementation guidance

Builds directly on T1, which bounded the delta window in `_account_balance_at`. This task adds the
status dimension to the same expressions.

**`_account_balance_at`** — `backend/app/services/dashboard_service.py:869-905`. Add the planned
exclusion to both branches. Settled balance is **never** toggle-governed: an account's balance
describes what the bank holds, so planned rows are always out, in either toggle state. Use
`counts_as_realized()` rather than an inline `status != "planned"` so the rule stays in one place.

**`_daily_deltas`** — lines 946-1009. Currently filters `is_ignored` and category `is_ignored` but
not status, and its window (`Transaction.date >= start`, `< end`) is already bounded, so there is no
T1-style defect here. It needs to become status-aware with a parameter, because it serves two
different questions:

- past days → settled only, planned excluded
- future days → planned included when the toggle is on, since this is what makes the projected
  balance line meaningful

`get_balance_history` (line 1012) consumes both `_balance_at` and `_daily_deltas` and already layers
recurring projections onto future days (lines 1058-1072). Planned rows must not double-count against
those projections — same guard as T5, keyed on `recurring_transaction_id`.

Note that `_daily_deltas` deliberately includes transfers and uses raw `Transaction.date` rather than
`reporting_date_col`, unlike the P&L aggregates. That asymmetry is pre-existing and correct for
balance — do not "fix" it as a side effect of this task.

## Files affected

- `backend/app/services/dashboard_service.py`
- `backend/tests/`

## Done when

Satisfies *"An account's settled balance never includes planned transactions, in either toggle
state"* and the balance-history portion of the isolation criteria.

Verified by: a planned transaction leaves settled balance unchanged with the toggle both on and off —
this is the criterion most likely to be got wrong, since every other aggregate is toggle-governed.
Balance history for past days ignores planned rows in both states; for future days it includes them
only when the toggle is on. A recurring occurrence with a planned row appears once in the future
line.

## Notes

The "toggle does not apply here" rule is a deliberate exception to T4/T5 and the reason this is its
own task. Make it explicit in a code comment — a future reader will otherwise assume the parameter
was forgotten.
