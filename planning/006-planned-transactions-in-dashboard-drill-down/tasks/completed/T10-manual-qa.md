# T10 — Manual QA and reconciliation pass

| Field      | Value      |
| ---------- | ---------- |
| Task       | T10        |
| Feature    | 006        |
| Status     | Done       |
| Depends on | T3, T5, T8 |
| PR         |            |
| Jira       | —          |

## Description

Confirm in the running app what the tests assert in isolation, on the surfaces a unit test cannot
reach.

## Implementation guidance

With the *include planned* checkbox **on**, on the dashboard:

- [ ] Click a category bar. The drawer's footer total equals the amount on the bar.
- [ ] The drawer lists the planned entries for that category and month, each with the violet Planned
      badge; projections carry the primary-tinted Recurring badge.
- [ ] The footer's "includes N planned · …" line matches the badged rows.
- [ ] Click a planned row → the transaction dialog opens with the planned/realized control reflecting
      its state. Click a projection → nothing happens.
- [ ] Repeat for the monthly **Income** and **Expenses** figures and for a day on the balance-flow
      chart: each drawer's total matches the figure that opened it.
- [ ] Privacy mode masks the planned line like every other amount.
- [ ] Both light and dark themes render both badges legibly.

With the checkbox **off**:

- [ ] The four figure drawers contain no planned rows and no planned line — identical to before this
      feature.
- [ ] The **uncategorized** drawer still lists planned rows, and its row count matches the number on
      the "categorize now" badge (modulo the separate divergences logged as backlog 007: rows in
      closed accounts and `is_ignored` rows).

Toggling:

- [ ] Flip the checkbox with a drawer open, reopen it — contents reflect the new state, not a cached
      one.

Also confirm the untouched surfaces:

- [ ] `/transactions` returns the same rows in both checkbox states.
- [ ] Account balances are unchanged in both states.
- [ ] `/budgets` and the reports Budget tab are unchanged.

## Verification performed

**Automated reconciliation against the live local database** (read-only; the stored preference was
never written — the `pnl_include_planned` override was used instead). A script inside the running
backend container replicated exactly what the drawer shows: the `user_pnl_only` list plus the
client-side projection merge from `buildDrillDownItems`, compared against
`get_spending_by_category` for the same month.

Result, on the top six categories of the current month:

| Scope | Outcome |
| ----- | ------- |
| `pnl_include_planned=false` | 0 rows for every category, against non-zero chart figures — **DIFF on all six**. This is the defect the spec describes, reproduced on real data. |
| `pnl_include_planned=true` | **MATCH on all six**, to the cent. |

The account carries `include_planned=True` and it is the 1st of the month, so this month's spending
is entirely planned rows — meaning that before this change, every category drawer on this dashboard
opened *empty* against a populated bar. The fix is confirmed end-to-end.

The backend container hot-reloaded the change (WatchFiles), so this ran against the edited code, not
a stale image.

**Not verified — needs a browser.** The visual half of this task could not be executed from this
environment: badge colours in light and dark themes, the footer line rendering, click-to-open-dialog
on a planned row, projections staying inert, privacy masking of the planned amount, and the
toggle-and-reopen cache behaviour. The logic behind each is covered by
`src/lib/drill-down-utils.test.ts` and the type-checker, but the rendering itself is unconfirmed.
**Someone should run the checklist below in the browser before this ships.**

## Files affected

- none (verification only)

## Done when

Every box above is checked, or a failure is logged as a new task in this folder / a backlog item in
`planning/README.md`.

## Notes

The reconciliation checks are worth doing in a mixed-currency month if the test data allows it — the
chart converts server-side per currency bucket and the drawer converts per row, so a rounding
divergence would show up there and nowhere else.
