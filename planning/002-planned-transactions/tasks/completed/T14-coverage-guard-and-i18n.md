# T14 — Coverage guard and i18n completeness

| Field      | Value                    |
| ---------- | ------------------------ |
| Task       | T14                      |
| Feature    | 002                      |
| Status     | Done                     |
| Depends on | T5, T6, T9, T10, T12, T13 |
| PR         |                          |
| Jira       | —                        |

## Description

The cross-cutting test that catches the plan's highest-rated risk: an aggregation site that was
missed and silently counts planned transactions as realized. Plus a check that no locale was left
behind.

## Implementation guidance

**Why this is its own task.** Per-task tests verify the site each task touched. They cannot catch a
site nobody thought about — and `status` was previously absent from *every* aggregate in the
codebase, so the surface being converted is wide. This test asserts coverage from the outside.

**The matrix.** Seed exactly one planned transaction. For each endpoint below, assert its figures in
both toggle states:

| Endpoint / figure | Toggle off | Toggle on |
| ----------------- | ---------- | --------- |
| Dashboard income / expenses | unchanged from baseline | differs by the amount |
| Spending by category | unchanged | differs by the amount |
| Trends | unchanged | differs |
| Budget actuals | unchanged | differs |
| Cash-flow report | unchanged | differs |
| Per-account stats | unchanged | differs |
| **Account settled balance** | **unchanged** | **unchanged** |
| **Balance history, past days** | **unchanged** | **unchanged** |
| ~~Balance history, future days~~ | — | — | *(dropped — see below)* |
| **Transactions list contents** | **identical** | **identical** |

The bold rows are the exceptions and the ones most likely to be got wrong: balance is never
toggle-governed, and list membership is never toggle-governed (D3). Everything else moves with the
toggle.

Run the whole matrix under **both** `cash` and `accrual` accounting modes — `reporting_date_col`
selects a different date column in each, so a bug can hide in one mode and not the other.

**A "baseline" assertion is not enough on its own.** For each toggle-on row, assert the figure
differs by *exactly* the seeded amount, not merely that it changed. A site that double-counts passes
a weaker check.

**i18n.** Assert every key added by T11, T12 and T13 exists in every locale file under
`frontend/src/locales/`. The repo ships en, de, pl, ru, uk and others; a missing key in a rarely-used
locale will not surface in manual QA.

## Files affected

- `backend/tests/` — new cross-cutting test module
- `frontend/src/locales/*.json` — fill any gaps found

## Done when

Satisfies *"Aggregate behavior in both toggle states is covered by automated tests for: balance,
dashboard totals, budget actuals, credit-card committed limit, and bill assignment"* and *"New
user-facing strings exist in all locale files currently shipped in the repo."*

Verified by the matrix above passing in both accounting modes, and the i18n check passing with no
missing keys.

## Notes

If this test finds a site that no earlier task covered, fix it here and note which task's scope it
should have fallen under — that is signal about the inventory being incomplete, worth recording in
`plan.md`.

**Outcome.** `tests/test_planned_transactions_coverage.py` — 10 tests parametrized over both
accounting modes, 20 cases, all green.

**One matrix row was dropped, not skipped.** "Balance history, future days" is not assertable through
the API: `get_balance_history` renders every day after today as `balance=None` for the current month
(the `day <= cutoff_day` guard). T6 found this and covers the future window directly on
`_daily_deltas` instead. Recording it here rather than leaving a row that silently never ran.

Three exceptions are asserted as *unchanged* across both toggle states, which is the part most likely
to regress: settled balance, elapsed-day balance history, and list contents (the D3 guard, which also
asserts the planned row **is** present in both). Committed credit and the overdue count are likewise
toggle-independent — a planned purchase is committed the moment it is recorded.

Every toggle-governed assertion checks the figure moved by *exactly* the planned amount; a
double-counting bug fails these where a weaker "it changed" check would pass.

**The matrix found no missed sites** — every surface already behaved correctly, which is the outcome
the safe `include_planned=False` default was designed to produce.

**i18n** needed no new work: the repo already ships `frontend/src/locales/i18n.test.ts` enforcing key
parity across locales, and all T11–T13 keys were added to all nine locales (en, pt-BR, es, fr, de, it,
pl, ru, uk) during T11. That test passes.

Backend: 2464 passed, 7 skipped, ruff clean. Frontend: `tsc -b` clean, 52 tests green, ESLint at
baseline.
