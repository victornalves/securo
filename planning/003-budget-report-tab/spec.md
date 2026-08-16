# Spec: Budget report tab

| Field        | Value        |
| ------------ | ------------ |
| ID           | 003          |
| Type         | Feature      |
| Status       | Approved     |
| Version      | 0.4.0        |
| Author       | Victor Alves |
| Last updated | 2026-08-15   |
| Jira         | —            |
| Confluence   | —            |

## Context & Problem

A budget in Securo is a monthly envelope for one category: a `budgets` row carries
`category_id`, `amount`, and `month` (always the first day of the month), plus an
`is_recurring` flag. For any given month the effective envelope is resolved by
`budget_service._build_budget_map` — a month-specific override wins, otherwise the most
recent recurring default whose month is `<= M` applies. There is no period other than the
month: an envelope for a quarter or a year does not exist in the model.

That data surfaces in exactly two places today, both of them locked to a single month:

- **`/budgets`** — one month at a time, one progress bar per category, driven by
  `GET /api/budgets/comparison?month=`.
- **The dashboard summary card** — a *Budget Balance* metric for the current month
  (budgeted minus spent, counting budgeted categories only on both sides).

**`/reports` knows nothing about budgets.** Its four tabs (Net Worth, Income & Expenses,
Cash Flow, Money Map) describe what happened — per-category spending, trends, flows — but
never against what was planned. So the reports screen, which is where the user goes to ask
questions about a period, cannot answer the most basic budgeting question: *did I stay
inside my envelopes?* To answer it for March the user has to leave reports, open `/budgets`,
step back to March, and read the bars one by one — losing the period context they were
working in and any ability to see the categories side by side at comparable scale.

A second gap sits underneath the first: **spending that falls outside every budget is
invisible as a quantity.** `/budgets` lists unbudgeted categories mixed in with the rest,
each with an empty envelope; the dashboard metric excludes them on purpose (documented in
`385d967` — including them would answer "did I overspend overall?", which income/expenses
already covers). Nothing anywhere adds them up. The user cannot see how much of their
spending is not being planned at all, which is the number that says whether the budget is
a real plan or a partial one.

The timing is right because the period control this needs was just built: `c85196f`
(merged to `main` via PR #2) added a **Month mode** to `/reports` — a Range/Month toggle,
a `MonthStepper` bounded by `/reports/bounds`, an `anchor_month` (`YYYY-MM`) parameter on
every report endpoint, and URL persistence. Budgets are monthly, and the user consumes them
month by month, so the natural filter for this tab already exists on the screen and does
not need to be invented.

## Goals

- Let the user see, inside `/reports`, planned versus realized per category for the selected
  period, as one column chart that puts every category on the same scale.
- Make spending that falls outside every budget visible as a single, explicit quantity.
- Reuse the period filters already on the screen (Month mode and the range presets) instead
  of adding a third period control to the page.
- Keep every figure reconcilable with `/budgets` and the dashboard Budget Balance for the
  same month — the same number must not have two values in two screens.
- Make over-budget categories identifiable at a glance, without the reader having to compare
  bar heights.

## Non-Goals

- Creating, editing, or deleting budgets from the reports screen — that stays in `/budgets`.
- Changing budget resolution semantics, the `/budgets` page, or the dashboard metric.
- Budgets for income. Budgets constrain spending; the realized side counts debits only,
  exactly as `/budgets` does today.
- Pro-rata pacing or forecasting for a partially elapsed month (no "you should have spent X
  by day 12" line, no projection of month-end spend).
- Category-group rollups (grouping the columns by `CategoryGroup`).
- Drilling from a column into the transactions behind it.
- Any change to the behaviour of the other four report tabs.
- Introducing budget periods other than the month into the data model.

## User Stories / Use Cases

- As a user reviewing last month, I want to see each budgeted category's realized bar next
  to its budgeted bar, so I can tell in one glance which envelopes I broke and by how much.
- As a user stepping month by month, I want the month arrows at the top of the reports screen
  to move this chart too, so comparing March to April is two clicks and no context switch.
- As a user, I want one column that totals everything I spent outside any budget, so I know
  how much of my spending is unplanned rather than merely over plan.
- As a user looking at a longer window (6M, YTD, 1Y), I want the same comparison aggregated
  over that window, so I can see whether an envelope is chronically wrong rather than wrong
  once.
- As a user, I want the tab's totals (budgeted, realized, balance) in the same hero card the
  other tabs use, so the summary reads the same way everywhere.

## Acceptance Criteria

**Tab and chart**

- [ ] A fifth tab labelled *Budget* is present in the `/reports` tab bar and is selectable;
      selecting it does not alter the behaviour of the other four tabs.
- [ ] The tab renders a grouped column chart with one X-axis slot per category, each slot
      showing two bars side by side: **Realized** and **Budgeted**.
- [ ] Only categories with a budget resolved for the selected period appear as category
      slots. Categories with spending but no budget never get their own slot.
- [ ] A budgeted category with no spending in the period still appears, with a zero-height
      Realized bar (consistent with `33c797b` on the dashboard).
- [ ] The chart ends with one extra slot labelled **Out of budget**, whose single bar is the
      total expense spending of the period that falls in categories with no budget resolved
      for that period, including uncategorized spending.
- [ ] Category slots are ordered by Realized descending; the *Out of budget* slot is always
      last regardless of its size.
- [ ] A category whose Realized exceeds its Budgeted is marked as over budget by an explicit
      visual cue (colour and/or badge), not only by the relative bar heights.
- [ ] Hovering a category slot shows budgeted, realized, difference, and % of budget used.
- [ ] The chart is legible with at least 20 budgeted categories — labels must not overlap or
      be silently dropped.
- [ ] When the period has no budget at all, the tab shows the standard empty state instead of
      an empty chart frame.

**Period filters**

- [ ] In Month mode the tab reports on the selected anchor month; stepping the `MonthStepper`
      re-renders the chart for the new month, and the selection stays in the URL like the
      other tabs.
- [ ] In Range mode the tab supports the existing historical presets (6M, YTD, 1Y, 2Y).
      Budgeted is the sum of each month's effective envelope across the months in the window;
      Realized is the spending across the same window.
- [ ] A month in which a category has no resolved envelope contributes **0** to that
      category's Budgeted total — it does not shrink the window, and it does not divert that
      month's spending to *Out of budget*. A change in envelope amount across the window is
      not a gap: each month contributes its own effective amount.
- [ ] A category qualifies for its own slot when its Budgeted total over the window is
      greater than zero; its Realized bar then covers the **whole** window, including months
      that contributed 0. A category whose Budgeted total over the window is zero — no
      envelope at all, or only envelopes explicitly set to 0 — is not a slot and its spending
      lands entirely in *Out of budget*.
- [ ] When a category's envelope covers only part of the window, its tooltip states the
      coverage (e.g. "budgeted in 8 of 12 months"), so partial coverage reads as partial
      coverage rather than as an overspend.
- [ ] Selecting the Budget tab puts the page in Month mode unless the URL already pins a mode
      explicitly; switching to Range mode from the tab works and persists while on the tab.
- [ ] The interval selector (daily/weekly/monthly/yearly) is hidden on this tab — the chart
      has categories on the X axis, not time.

**Numbers**

- [ ] For any single month, the Realized value of every category equals what
      `GET /api/budgets/comparison?month=` reports for that category, to the cent — same
      debit definition, same split adjustments (own-split offsets and viewer shared spending),
      same recurring projections, same credit-card accounting mode (`cash` vs `accrual`
      reporting date).
- [ ] For any single month, the Budgeted value of every category equals the envelope
      `/budgets` shows for that month, including the recurring-default-versus-override
      resolution.
- [ ] The hero card shows total Budgeted, total Realized (budgeted categories only), the
      Balance between them with the same sign colouring as the dashboard Budget Balance
      (green with room left, red once collectively overspent), and the Out-of-budget total.
- [ ] All amounts are in the user's primary currency, formatted with the user's locale.

**Cross-cutting**

- [ ] With an active Collection filter, the tab shows an explanatory notice instead of the
      chart, matching the dashboard's precedent: budget data is workspace-wide and takes no
      account filter, so a filtered actual against an unfiltered budget would be misleading.
- [ ] Privacy mode masks every monetary value on the tab, including axis ticks and tooltips.
- [ ] Every new user-facing string exists in all nine locale files (`frontend/src/locales/`),
      keeping `i18n.test.ts` key-parity green.
- [ ] Backend tests cover: single month; multi-month range aggregation; recurring default
      versus month-specific override inside one window; the out-of-budget bucket including
      uncategorized spending; a period with no budgets at all.

## Constraints & Dependencies

- **Branch base.** This work depends on `c85196f` (month mode, `anchor_month`,
  `/reports/bounds`, `MonthStepper` wiring) and on the dashboard budget work `385d967` /
  `33c797b` whose precedents this spec follows. All three are on `main` as of 2026-08-15, so
  this branches from `main` with no other prerequisite.
- **Reuse, don't re-derive.** The consistency criteria above are only achievable by reusing
  the existing resolution rules: `budget_service._build_budget_map` for envelopes, and the
  actual-spending logic in `budget_service.get_budget_vs_actual` (`counts_as_user_pnl`,
  `owner_split_offset_by_category`, `viewer_shared_spending_by_category`,
  `_get_recurring_projections`, and `reporting_date_col(accounting_mode)`). Re-implementing
  any of it in a report service would drift from `/budgets` on the first edge case.
- **Budgets are workspace-scoped, not account-scoped.** There is no account dimension to
  filter on, which is what forces the Collection-filter behaviour above.
- **Envelope history is not rewritten on change.** `budget_service.update_budget` responds to
  a new `effective_month` on a recurring budget by inserting a *new* recurring row from that
  month, and `_build_budget_map` only resolves recurring rows with `month <= M`. So the
  months before a category's first envelope have no envelope at all — this, rather than a
  forgotten month, is where gaps come from in a long window, and it is what the coverage
  indicator above exists to make visible.
- **Range windows are capped at 24 months** by the existing report endpoints (`months le 24`);
  the budget tab inherits that cap.
- **Categories are not typed as income or expense** in the data model, so any category can
  carry a budget row. The realized side counts debits only, so a budget on a category that
  only receives credits will legitimately show a zero Realized bar.
- **Multi-currency.** `budgets` carries `currency`/`amount_primary`, and spending is summed
  via `amount_primary` with an FX fallback; the tab reports in the primary currency like
  every other report tab.
- **Response shape.** The existing `ReportResponse` is time-series shaped (`trend`,
  `composition`, `category_trend`); this tab is category-shaped. Whether to extend it or add
  a dedicated schema is a plan-phase decision, not a spec one.

## Open Questions

All questions raised during drafting were resolved at approval (v0.3.0):

- **Uncategorized spending** — folded into the *Out of budget* column. Revisit only if it
  turns out to dominate that column against real data.
- **Current, incomplete month** — no pacing, no pro-rata, no "in progress" treatment. A full
  envelope towering over five days of spending is exactly what `/budgets` shows today, and
  the tab does not diverge from it.
- **Tab position** — Budget is the last tab, after Money Map.

None open. New unknowns found during planning go here.

## Revision History

| Version | Date       | Author       | Change                                                                                             |
| ------- | ---------- | ------------ | -------------------------------------------------------------------------------------------------- |
| 0.4.0   | 2026-08-15 | Victor Alves | Renumbered 002 → 003; branch base is now plain `main`, which carries all prerequisites      |
| 0.3.0   | 2026-08-15 | Victor Alves | Approved. Closed the three remaining questions: uncategorized folded in, no pacing, tab goes last     |
| 0.2.0   | 2026-08-15 | Victor Alves | Resolve multi-month aggregation: a month with no envelope counts as 0; add coverage indicator        |
| 0.1.0   | 2026-08-15 | Victor Alves | Initial draft                                                                                        |
