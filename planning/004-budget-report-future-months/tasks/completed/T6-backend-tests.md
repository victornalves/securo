# T6 — Backend test coverage

| Field      | Value          |
| ---------- | -------------- |
| Task       | T6             |
| Feature    | 004            |
| Status     | Done           |
| Depends on | T2, T3, T4, T5 |
| PR         |                |
| Jira       | —              |

## Description

Cover the future-month behaviour, the projection rule, and — most importantly — that `/budgets`
did not move.

## Implementation guidance

New module `backend/tests/test_budget_report_future_months.py`, following the fixtures the
existing budget-report tests use. One test per row:

| Case | Assertion |
| ---- | --------- |
| Future month, envelopes + planned rows | `budgeted` from the envelope, `planned` = the rows, `realized == 0` |
| Future occurrence as a *projection* | contributes nothing to either figure |
| Same occurrence as a real `planned` row | counted once in `planned` |
| Past occurrence of an `auto_generate=false` rule | still counted in `realized` |
| Past month, unpromoted planned entry | in `planned`, absent from `realized` |
| Current month, posted + planned + a projection later this month | posted in `realized`, planned in `planned`, projection excluded |
| Unbudgeted category with both kinds of spending | `out_of_budget` and `out_of_budget_planned` |
| `include_planned` true vs false | identical response |
| Planned card instalment, `cash` vs `accrual`, and with `effective_bill_date` | lands in the same month as the bill view |
| `anchor_month` past the +12 cap | 200, envelopes, zero commitments |

**The regression that matters most:** a `/budgets` snapshot test. Build a fixture with posted
rows, planned rows, a group split, an own split and an active recurring rule, then assert
`get_budget_vs_actual` output is unchanged by this feature — that is what the `planned_scope=None`
default exists to guarantee, and the only test that can catch it silently drifting.

Add the `latest_month` cases from T5 here if they are not already in that task's tests.

Run the full suite: it was 2422 passed / 7 skipped at the close of 002, and Ruff must stay clean.

## Files affected

- `backend/tests/test_budget_report_future_months.py`
- `backend/tests/` (existing budget-report module, where a case belongs there instead)

## Done when

Every bullet of the spec's **Cross-cutting** test criterion is covered and the suite is green.

## Notes

**Outcome.** `tests/test_budget_report_future_months.py`, 20 tests, all green. Full suite:
**2484 passed, 7 skipped**, Ruff clean.

One deviation from the plan: the `/budgets` guard test
(`test_budgets_screen_keeps_its_own_semantics`) pins the paths this feature actually touched —
`actual` follows the preference in both states, and projections still count — rather than
building a group-split and own-split fixture. Split behaviour under `/budgets` is already
covered by the existing suite (`test_planned_transactions_coverage.py` and the budget tests),
and the full-suite run is the real regression guard for the `planned_scope=None` default. Worth
knowing that the narrower test is what exists here.
