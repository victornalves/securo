# T5 — Budgets, cash-flow reports and per-account stats

| Field      | Value |
| ---------- | ----- |
| Task       | T5    |
| Feature    | 002   |
| Status     | Todo  |
| Depends on | T4    |
| PR         |       |
| Jira       | —     |

## Description

Thread `include_planned` through the remaining aggregation surfaces: budget actuals, the cash-flow
report, and per-account statistics.

## Implementation guidance

Use the `include_planned(user)` helper from T4. Same rule throughout: read at the API boundary, pass
down as a parameter.

**Budgets** — `backend/app/services/budget_service.py`, actuals at lines 287, 308, 351, 368. These
already switch `use_effective_date` on the accounting mode; add the flag alongside. Budget
projections at lines 317-319 and 377-379 already fold in recurring projections — see the
double-counting note below.

**Cash flow** — `backend/app/services/report_service.py`, `get_cash_flow_report` (line 1116). Two
places need care:

- Lines 1217-1245 already handle *future booked* transactions (`flow_date_col > today AND <= end`).
  Planned rows now land in that window. Make sure they are counted once, governed by the flag.
- Lines 1247-1282, accrual mode, add back "pending CC purchases" whose `effective_date` falls in the
  future window so they are not double-counted. Planned CC purchases interact with this — work
  through the arithmetic rather than pattern-matching the existing branch.
- `_get_baseline_projection` (lines 1005-1113) forecasts from historical means. Historical means must
  be computed from **realized** rows only — use `counts_as_realized()` there regardless of the
  toggle, otherwise a planned row entered for a past month would feed back into the forecast of
  itself.

**Per-account stats** — `backend/app/services/account_service.py`, lines 66-92 and
`get_account_summary` at 679.

**Double-counting guard.** `_get_recurring_projections` (`dashboard_service.py:41-96`) and the
cash-flow forecast both project recurring occurrences. Once T8 makes recurring placeholders `planned`
rows, an occurrence could be counted twice — once as a materialized planned row, once as a virtual
projection. Reuse the existing linkage rather than inventing a second rule: `Transaction`
already carries `recurring_transaction_id` (`transaction.py:87-92`), and `recurring_match_service`
has `find_real_tx_for_occurrence` (line 74). Skip projecting an occurrence that already has a row.

**Do not** touch the two closed-bill carve-outs — `transaction_service.py:315-320` and
`account_service.py:712-717`. They test `status == "pending"` explicitly, so a planned row does not
match them. Leave them as they are and cover them with a regression test.

## Files affected

- `backend/app/services/budget_service.py`
- `backend/app/services/report_service.py`
- `backend/app/services/account_service.py`
- `backend/app/api/budgets.py`, `backend/app/api/reports.py`, `backend/app/api/accounts.py`
- `backend/tests/`

## Done when

Completes *"With the include planned toggle off, no planned transaction contributes to … budget
actuals … or cash-flow report actuals"* and the toggle-on counterpart.

Verified by: one planned transaction; budget actuals, cash-flow report and per-account stats each
move by exactly its amount when the toggle flips. A recurring occurrence with a materialized planned
row is counted **once**, not twice. A planned row dated in a past month does not alter
`_get_baseline_projection`'s historical mean. The closed-bill carve-outs behave identically to
`main`.

Run the aggregate tests under **both** `cash` and `accrual` accounting modes — `reporting_date_col`
selects a different date column in each, so a bug can hide in one mode.

## Notes

The double-counting guard is the subtlest part of this task. If it turns out to need a design
decision rather than reuse of the existing linkage, pause and update `plan.md` before implementing.
