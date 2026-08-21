# T12 — Manual QA and parity check

| Field      | Value                |
| ---------- | -------------------- |
| Task       | T12                  |
| Feature    | 004                  |
| Status     | Todo                 |
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
