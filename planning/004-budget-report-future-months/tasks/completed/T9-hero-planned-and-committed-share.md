# T9 — Hero: planned total, preference-driven balance, committed share

| Field      | Value |
| ---------- | ----- |
| Task       | T9    |
| Feature    | 004   |
| Status     | Done  |
| Depends on | T7    |
| PR         |       |
| Jira       | —     |

## Description

Make the summary card state planned explicitly, apply the *include planned* preference to the
headline only, and add the committed share on future months.

## Implementation guidance

The tab's own summary card lives at the top of `BudgetReport.tsx` (it opts out of the shared
hero). Three changes:

1. **A planned metric** in the `metrics` array, between realized and out-of-budget, with a
   swatch matching the planned segment's texture from T8.
2. **The headline balance follows the preference** (004/D2 — the toggle governs the headline
   only, never the chart). Read it the way `IncludePlannedToggle` does — `useAuth()`, then
   `user?.preferences?.include_planned ?? false` — and pick `summary.committed_balance` when
   on, `summary.balance` when off. Keep the existing emerald/rose sign colouring. The metrics
   row always shows realized and planned separately, in both toggle states, so the headline is
   never ambiguous about what it counts.
3. **Committed share on future months.** When `data.meta.start_date` is after today — no new
   prop needed, `meta` already carries it — show the committed total as a percentage of total
   budgeted next to the balance: `(realized + planned) / budgeted`, via a new
   `reports.committedShare` key. Suppress it when `budgeted <= 0`, and under privacy mode.
   This is a ratio of recorded commitments to envelope, not a projection of spend, so 003's
   no-pacing non-goal is untouched.

The loading skeleton should grow by one metric block so the layout does not jump.

## Files affected

- `frontend/src/components/reports/BudgetReport.tsx`

## Done when

Satisfies *"The hero shows total budgeted, total realized, total planned, the balance against
the committed total, and the out-of-budget total"*, *"The include planned toggle … governs only
whether `planned` is folded into the hero's headline"*, and the committed-share criterion.

Verified by: toggling *include planned* changes the headline and nothing in the chart; a future
month shows the share, a past month does not.

## Notes

**Outcome.** As planned. Two details worth recording: the planned metric's swatch is striped
rather than a new colour, matching the chart segment; and `isFuture` compares *months* via
`currentMonth()` from `lib/month-utils` rather than `toISOString().slice(0, 10)` — the latter
answers in UTC and would read a late evening in a western timezone as tomorrow.
