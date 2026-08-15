# Spec: Reports month filter

| Field        | Value                                    |
| ------------ | ---------------------------------------- |
| ID | 001 |
| Type | Feature |
| Status       | Approved                                 | <!-- Draft | Approved | Superseded -->
| Version      | 0.4.0                                    |
| Author       | Victor Alves                             |
| Last updated | 2026-07-28 |
| Jira         | (epic key, optional)                     |
| Confluence   | (page link, optional)                    |

## Context & Problem

The `/reports` page (net worth, income & expenses, cash flow) only lets users pick from a
curated list of rolling-window presets (e.g. `6m`, `1y`, `2y`, `ytd`), all anchored to
*today*. The shortest available window is 6 months. A user who wants to look at a single
past month — e.g. "how did I do in March?" — has no way to isolate it: the smallest preset
still spans half a year of surrounding data, making it hard to read one month's numbers out
of the chart/table.

The app already has a month-picker interaction pattern (`MonthStepper`, used on
`/transactions`) that lets a user step to and select an arbitrary single month
(`‹ March 2026 ›`). We want the same interaction available on `/reports`, so a user can view
each report scoped to one specific calendar month instead of only a rolling window ending
today.

## Goals

- Let a user select a single specific calendar month (past, current, or any month with
  data) on `/reports` and see that report's data scoped to that month only.
- Reuse the app's existing month-select interaction pattern rather than introducing a new
  date-range picker.
- Keep the existing rolling-window presets (6m, 1y, 2y, ytd, etc.) available alongside the
  new month selector — this is an additional way to filter, not a replacement.
- Support this on all four report tabs (net worth, income & expenses, cash flow, and money
  map, which shares the income & expenses data) to the extent each tab's chart/table type
  makes sense for a single-month view.
- When in single-month mode, default the chart/table granularity to daily (for net worth
  and income & expenses; cash flow is already daily by default) so a one-month window still
  shows meaningful detail instead of collapsing to a single monthly point.
- When in single-month mode, show a "vs. previous month" comparison on the summary totals
  (e.g. delta value/percentage) for each report tab.
- Extend the report backend (`/api/reports/net-worth`, `/income-expenses`, `/cash-flow`) to
  accept an explicit anchor month, since today it only supports rolling windows relative to
  the current date or `period=ytd` — neither can express "March 2025" when today is a later
  month. This is in scope for this feature's plan, not deferred to a separate spec.

## Non-Goals

- No arbitrary custom date-range picker (start date + end date) — month-level granularity
  only, matching the existing `MonthStepper` pattern.
- No change to the existing rolling-window presets' behavior or bounds.
- No new report types — this only changes how the time window for existing reports is
  selected.
- Multi-month custom selection (e.g. "March and April combined") is out of scope.

## User Stories / Use Cases

- As a user reviewing my finances, I want to pick "March 2026" on the reports page, so that
  I can see my net worth, income/expenses, and cash flow for exactly that month without
  surrounding months diluting the view.
- As a user, I want to step month-by-month (‹ ›) through past months on the reports page, so
  that I can quickly compare adjacent months without reopening a picker each time.

## Acceptance Criteria

- [ ] `/reports` offers a month selector (reusing the existing `MonthStepper`/`MonthPicker`
      pattern) as an alternative to the current rolling-window presets, on all four tabs
      (net worth, income & expenses, cash flow, money map).
- [ ] Selecting a month shows that report's data scoped to that calendar month only (not a
      window that merely includes it).
- [ ] The month selector allows navigating to any past month that has account/transaction
      data, and to the current month.
- [ ] Switching between the month selector and a rolling-window preset is a single, obvious
      UI action, and the previously selected preset/month is not silently lost when
      switching tabs.
- [ ] The existing rolling-window presets continue to work exactly as before (no regression).
- [ ] Reports requested for a month with no data show the existing "no data" state rather
      than an error.
- [ ] In single-month mode, net worth and income & expenses default to daily granularity;
      cash flow keeps its existing daily default.
- [ ] In single-month mode, each report tab's summary shows a comparison against the
      previous month (delta value and/or percentage).
- [ ] The month selector allows navigating back to the month of the workspace's earliest
      transaction, and no further.
- [ ] `/api/reports/net-worth`, `/income-expenses`, and `/cash-flow` accept a way to anchor
      the report to a specific past month (not just a rolling window ending today or `ytd`).

## Constraints & Dependencies

- Reuses `frontend/src/components/month-stepper.tsx` / `monthpicker.tsx` and
  `frontend/src/lib/month-utils.ts`, already used on `/transactions`, `/budgets`, and
  `/dashboard`.
- Backend report endpoints (`/api/reports/net-worth`, `/income-expenses`, `/cash-flow`)
  currently only accept a `months` (rolling window length) or `period=ytd` parameter, always
  anchored to *today* — there is no way to anchor the window to an arbitrary past month.
  Supporting an arbitrary single month therefore requires a backend change (e.g. an explicit
  date-range or anchor-month parameter), not just a frontend change.

## Open Questions

None outstanding — resolved during spec review (see Revision History 0.2.0).

## Revision History

| Version | Date       | Author | Change        |
| ------- | ---------- | ------ | ------------- |
| 0.1.0   | 2026-07-28 | Victor Alves | Initial draft |
| 0.2.0   | 2026-07-28 | Victor Alves | Resolved open questions: daily granularity in month mode, previous-month comparison in scope, navigation limit = earliest transaction, backend anchor-month support in scope |
| 0.3.0   | 2026-07-28 | Victor Alves | Approved |
| 0.4.0   | 2026-07-28 | Victor Alves | Scope decision during planning: month mode also covers the Money Map tab (4 tabs total, not 3) |
