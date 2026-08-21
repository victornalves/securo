# T12 — Manual QA and parity check

| Field      | Value                |
| ---------- | -------------------- |
| Task       | T12                  |
| Feature    | 004                  |
| Status     | In Progress          |
| Depends on | T6, T8, T9, T10, T11 |
| PR         |                      |
| Jira       | —                    |

## Description

Walk the feature against real data and confirm the one divergence from `/budgets` is the one the
spec sanctioned — and nothing else.

## Implementation guidance

Against a workspace with envelopes, planned commitments in future months, at least one active
recurring rule, and one over-budget category:

**Navigation.** Step forward from the current month to `latest_month` and confirm the arrow
disables there. Switch tabs from a future month → clamped to the current month, URL updated.
Reload a pinned future-month URL → opens on it. Range mode shows no forward preset.

**Parity.** For the current month and one past month, compare each category against `/budgets`
for the same month:

- with *include planned* off, `realized` must match `/budgets` actual **except** for recurring
  projections dated later in the current month, which this tab excludes by design (spec D7);
- with it on, `realized + planned` must match, subject to the same single exception;
- `budgeted` must match in every month, including future ones.

Write down the divergence you observe for the current month and confirm it equals exactly the
sum of the remaining projections — if it does not, something else is wrong.

**Presentation.** A category over budget by planned alone shows the rose cap on the planned
segment. Privacy mode masks axis ticks, tooltips, hero figures and the committed share. A
Collection filter still shows the notice instead of the chart. 20+ categories keep their labels.

**Regression.** `/budgets` and the dashboard Budget Balance report the same numbers as before
the branch, in both toggle states.

## Files affected

- None (verification only; findings go in Notes or become follow-up tasks)

## Done when

Every acceptance criterion in the spec is either verified here or covered by an automated test
from T6/T7, and the current-month divergence is confirmed to equal the excluded projections.

## Notes

**Automated verification, done (2026-08-20).** Run read-only against the live database of the
`Pessoal` workspace (1175 transactions, 50 planned rows, `include_planned` on), with the app's own
service functions:

- **Parity holds** for 2026-07 through 2026-10. For every one of the 16 budgeted categories, and in
  each of the four months, `/budgets` actual equals the report's `realized + planned` (the
  preference is on) and the envelopes match to the cent.
- **`latest_month` = 2027-01**, derived from the furthest planned commitment — not the 12-month cap,
  which would have been 2027-08. The bound is following the data.
- **A future month reads as intended**: 2026-09 reports 310.22 realized against 6695.86 planned,
  2026-10 shows 1400.00 in the out-of-budget planned half.
- The running app's OpenAPI schema carries `latest_month` and all the new row/summary fields, so the
  backend reloaded cleanly.

**The divergence this task asks to measure could not be exercised on live data**: the workspace has
**zero** recurring rules, so there are no future-dated projections for D3 to exclude, and the
current-month gap against `/budgets` is structurally 0.00. What the check proves is that nothing
*else* diverges. The exclusion itself is covered by
`tests/test_budget_report_future_months.py::test_future_projection_alone_contributes_nothing`,
paired with `test_past_projection_still_counts_as_realized` so neither can pass vacuously. Re-run
the live check once a recurring rule exists.

**Finding — 14 future-dated rows are `posted`, not `planned`.** They are instalment plans entered
by hand or imported (`PES SEM DOR LT (06/12)`, `PORTO SEGURO (08/10)`, `IG*myProfit (3/4)`, two
`(2/2)` imports), running from 2026-09 to 2027-03. Spec 002 left them alone on purpose — migration
066 scoped itself to `source='recurring'` because the user had never had a way to express intent
about manual rows. Navigable future months make that choice visible for the first time: those
instalments draw as **Realized** (solid) in a future month, which is what produces the 310.22 in
2026-09. The figures are faithful to the data; the data is what is wrong. Two consequences worth a
decision:

- promoting them to `planned` in the transactions list moves them into the planned segment, and
  extends `latest_month` to 2027-03 (the March instalment is currently past the reachable bound);
- if this pattern is common, a migration extending 066 to future-dated *manual* rows is a candidate
  follow-up — 002 declined it without this evidence.

**Still open — the browser pass.** Not doable from here: it needs a logged-in session at
http://127.0.0.1:3001 (this worktree's stack, port 3001 — the main install is on 3000). Both
containers hot-reload, so the branch is already live there. What to look at:

- step forward to 2027-01 and confirm the arrow disables; switch to Net Worth and confirm the month
  clamps back to 2026-08 with the URL following;
- a category over budget by commitments alone shows the rose cap on the striped segment;
- toggling *include planned* changes the hero headline and leaves the chart alone;
- privacy mode masks the axis, tooltips, hero figures and the committed share;
- a Collection filter still shows the notice instead of the chart.
