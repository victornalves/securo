# T14 — Coverage guard and i18n completeness

| Field      | Value                    |
| ---------- | ------------------------ |
| Task       | T14                      |
| Feature    | 002                      |
| Status     | Todo                     |
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
| Balance history, future days | unchanged | differs |
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
