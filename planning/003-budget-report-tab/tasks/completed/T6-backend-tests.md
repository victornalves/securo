# T6 — Backend tests for the budget report

| Field      | Value |
| ---------- | ----- |
| Task       | T6    |
| Feature    | 003   |
| Status     | Done  |
| Depends on | T5    |
| PR         | 5ac584c (local) |
| Jira       | —     |

## Description

Cover the aggregation rules that this feature invents, and pin the parity guarantee that the
whole design rests on.

## Implementation guidance

New file `backend/tests/test_budget_report.py`, following the fixture and async-session
conventions of `test_budget_service.py`.

| Case | Assertion |
| ---- | --------- |
| **Parity, realized** | Same fixture through `get_budget_vs_actual(month=M)` and the report with `anchor_month=M`: every category's realized value matches to the cent |
| **Parity, budgeted** | Idem for envelopes, with a recurring default *and* a month-specific override present so the resolution rule is exercised |
| **Missing month counts as 0** | Category budgeted in 3 of 6 months: `budgeted` == sum of those 3, `months_budgeted == 3`, `months_in_window == 6`, `realized` covers all 6 months |
| **Envelope change** | Recurring 800 effective January, 1000 effective May, 6-month window: total tracks month by month, not `6 × latest` |
| **Row membership** | A category whose only envelope is 0, and a category with no envelope: neither in `rows`; both counted in `summary.out_of_budget` |
| **Out-of-budget bucket** | Unbudgeted-category spending *and* uncategorized spending (`category_id IS NULL`) both land in `out_of_budget` |
| **Zero-spend budgeted category** | Budgeted, no transactions → present in `rows` with `realized == 0` |
| **Ordering** | `rows` descending by `realized` |
| **Empty period** | No budgets at all → `rows == []`, summary zeroed, `out_of_budget` still populated from unbudgeted spending |
| **Window resolution** | `anchor_month` scopes to that month; `period=ytd` starts 1 January; a `months` request whose resolved start spans an extra calendar month reports `months_in_window` accordingly |
| **API validation** | 422 for `anchor_month=2026-13`, `months=0`, `months=25` |

The parity cases are the important ones — they are what would catch a regression if someone
later "optimizes" the shared helper from T1.

Splits, shared spending, and recurring projections need no dedicated cases here: they are
covered by the existing `/budgets` suite and reach this report through the same helper. Add one
only if T1's extraction turns out to need a behavioural decision (it should not).

## Files affected

- `backend/tests/test_budget_report.py`

## Done when

- All cases above pass.
- `test_budget_service.py`, `test_budgets_api.py`, `test_report_service.py` and
  `test_report_service_coverage.py` still pass, unmodified.
- Ruff clean.

Satisfies the spec's backend test criterion.
