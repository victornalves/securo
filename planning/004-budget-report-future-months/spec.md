# Spec: Budget report future months

| Field        | Value        |
| ------------ | ------------ |
| ID           | 004          |
| Type         | Feature      |
| Status       | Approved     |
| Version      | 0.2.0        |
| Author       | Victor Alves |
| Last updated | 2026-08-20   |
| Jira         | —            |
| Confluence   | —            |

## Context & Problem

Two features shipped independently and stop just short of meeting.

**003 (budget report tab)** put planned-versus-realized per category inside `/reports`, driven
by the Month mode the reports screen already had. **002 (planned transactions)** gave Securo a
third transaction state — `planned` — for commitments the user has recorded but that have not
happened yet: next month's rent, the remaining instalments of a purchase already made, a bill
entered at its expected figure.

The obvious question the combination invites is the one the screen refuses to answer: *given
what I have already committed to, does next month fit inside my envelopes?* The user cannot
ask it, because the Budget tab's month filter stops at the current month —
`maxDate={new Date()}` on the shared `MonthStepper` (`frontend/src/pages/reports.tsx:661`).

The gap is a UI bound, not a missing capability. Almost everything underneath already works:

- `GET /api/reports/budget` accepts any well-formed `anchor_month` and never compares it to
  today (`backend/app/api/reports.py:76-95`). A future month returns 200 today.
- `_build_budget_map` resolves a future month's envelope correctly: a month-specific override
  wins, otherwise the most recent recurring default with `month <= M`
  (`backend/app/services/budget_service.py:33-88`). Recurring envelopes therefore extend
  forward indefinitely.
- `get_budget_window_totals` already passes the user's `include_planned` preference into the
  spending query (`backend/app/services/budget_service.py:458-463`), which reaches
  `counts_as_user_pnl` (`backend/app/services/_query_filters.py:66-113`). 002's T5 made this
  tab status-aware.
- `/budgets` itself has **no** upper bound on its month picker (`frontend/src/pages/budgets.tsx`),
  so navigating to a future month is already possible on the screen the report is supposed to
  reconcile with. The report tab is the only surface artificially clamped at today.

But lifting the clamp alone would ship wrong numbers, for three reasons.

**1. "Realized" is meaningless in a future month, and the toggle decides whether the month
exists at all.** The endpoint returns a single `realized` figure per category
(`backend/app/schemas/report.py`), gated by the global *include planned* preference. With the
toggle **off** — its default — every bar in a future month is zero, so the new filter shows an
empty chart and reads as a bug. With the toggle **on**, past months fold overdue planned
entries into a bar labelled *Realized*, which is precisely the confusion 002 exists to prevent.
One number cannot carry both meanings, and a preference switch is the wrong instrument for
deciding which meaning applies to a given month.

**2. Virtual recurring occurrences would fill future months with commitments the user never
made.** `_actual_spending_by_category` step 4 adds `_get_recurring_projections`
(`backend/app/services/budget_service.py:304-314`) — a pure read over `RecurringTransaction`,
not filtered by `status`, that materializes nothing and counts in any window. Under 002's model
a projection is a *forecast*, not a commitment: nothing was recorded, and the user may cancel
the subscription before it bills. Letting projections populate a future month would answer a
question this tab is not asking, and would do it inconsistently — every caller of
`generate_pending` passes `up_to=None`, so the cutoff is today
(`backend/app/tasks/recurring_tasks.py:35`, `backend/app/cli.py:22`,
`backend/app/api/recurring_transactions.py:80`), which means a rule's future occurrences exist
as a projection for most rules and as a real `planned` row only for the legacy rows migration
`066_recurring_placeholders_planned` reclassified. Same rule, two provenances, two behaviours.

**3. The month stepper is shared by all five tabs.** Loosening `maxDate` unconditionally would
let Net Worth, Income & Expenses, Cash Flow and Money Map navigate into months for which they
report nothing, replacing a disabled arrow with four empty charts.

## Goals

- Let the user select a future month on the Budget tab and see each envelope against what is
  already committed to that month.
- Represent realized and planned spending as two distinct quantities, so a bar's meaning is
  never ambiguous and never depends on which month is selected.
- Count only commitments the user actually recorded — real transaction rows — so a future month
  describes decisions already made rather than a forecast.
- Bound forward navigation to where the user's own commitments end, instead of letting recurring
  envelopes extend into an empty future forever.
- Leave the other four report tabs, `/budgets`, and the dashboard exactly as they are.

## Non-Goals

- **Range mode.** Forward navigation is Month mode only (D1). The historical presets (6M, YTD,
  1Y, 2Y) keep ending at today (`end_inclusive = today`,
  `backend/app/services/report_service.py:1630-1635`); no forward or straddling preset is
  introduced.
- Future months on the other four tabs. Their upper bound stays the current month.
- **Virtual recurring occurrences as a source for future months** (D3). If the user wants a
  recurring bill to count against a future envelope, the answer is a recorded planned
  transaction, not a projection.
- Materializing recurring placeholders as a side effect of viewing a future month. The report
  reads; it does not write rows.
- Pro-rata pacing or month-end projection of the *current* month — still a non-goal from 003.
  A future month shows what is committed, not an estimate of what will be spent.
- Statistical forecasting as an input. The cash-flow baseline model
  (`_get_baseline_projection`) is not a source for this tab.
- **Multi-currency correctness for planned entries** (D6). Single primary currency is assumed;
  the FX question 002 left open is deferred to its own spec, to be written when foreign-currency
  commitments actually exist.
- Any change to `/budgets`, to the dashboard Budget Balance, or to budget-resolution semantics.
- Creating or editing envelopes for a future month from the reports screen — that stays in
  `/budgets`.
- Promoting planned transactions, or any automatic promotion, from this tab.
- Distinguishing overdue planned entries from on-time ones inside a month's planned segment
  (D5) — they are counted, not called out.
- Budget periods other than the month, and category-group rollups — both still out, per 003.

## User Stories / Use Cases

- As a user who has just recorded next month's rent, instalments and school fees, I want to
  open the Budget tab on that month and see whether each envelope already covers what I have
  committed, so I can adjust before the month starts rather than after.
- As a user who entered the remaining instalments of a March purchase, I want each one to show
  up in the month it falls in, so I can see which future month is already tight.
- As a user looking at the current month, I want to tell apart what I have actually spent from
  what is merely committed for the rest of the month, so one bar does not blur the two.
- As a user reviewing a past month, I want a planned entry I never promoted to be visible as
  planned rather than counted as spending, so the month's realized figure still reconciles with
  my bank.
- As a user, I want the forward arrow to stop where my commitments stop, so I don't page
  through empty months that only show recurring envelopes.
- As a user on a future month, I want to see how much of the envelope is already committed as a
  share, so "tight" is a number and not an impression.

## Acceptance Criteria

**Forward navigation**

- [ ] On the Budget tab in Month mode, the `MonthStepper` can step and pick past the current
      month, up to `latest_month`.
- [ ] The other four tabs remain bounded at the current month. Navigating to a future month on
      Budget and then switching tabs clamps the selection back to the current month, and the
      `month` URL parameter follows the clamp.
- [ ] The selected future month persists in the URL like any other month selection, and a
      shared URL pinning a future month opens on that month with the Budget tab active.
- [ ] `GET /api/reports/bounds` gains a `latest_month` field (`YYYY-MM`, never null). The field
      is additive — existing consumers of `earliest_month` are unaffected.
- [ ] `latest_month` is the month of the furthest-dated **planned transaction** in the
      workspace, clamped to at least the current month and at most **12 months** past it.
      Recurring rules do not extend it, consistent with D3.
- [ ] With no planned transaction dated beyond the current month, `latest_month` is the current
      month and the tab behaves exactly as it does today.
- [ ] An `anchor_month` beyond `latest_month` is still served by the API — the bound is a
      navigation affordance, not a validation rule — and returns envelopes with zero
      commitments rather than an error.

**Realized and planned as two quantities**

- [ ] `BudgetReportRow` carries `realized` and `planned` as separate figures;
      `BudgetReportSummary` carries the same split, including for the out-of-budget total.
- [ ] `realized` counts only transactions whose status is not `planned`, in every month —
      past, current, or future — regardless of the *include planned* preference.
- [ ] `planned` counts transactions whose status is `planned` and whose reporting date falls in
      the selected month, in every month, regardless of the *include planned* preference. A
      future month therefore never renders an empty chart because of a preference setting.
- [ ] An unpromoted planned entry in a past month is counted in that month's `planned` and is
      absent from its `realized`. It is not flagged as overdue on this tab (D5).
- [ ] The chart draws the two as one stacked execution column per category: realized in the
      category's own colour, planned in the same hue but visually distinct (texture and/or
      opacity, never a different hue), against the same neutral envelope track used today.
- [ ] Over-budget is evaluated on `realized + planned` against `budgeted`, and the rose
      overspend cap covers the part of the stack above the envelope, whichever segment that
      part falls in (`frontend/src/lib/budget-report-utils.ts`).
- [ ] The tooltip shows budgeted, realized, planned, committed total, difference, and % of
      envelope used, plus the existing coverage line.
- [ ] The out-of-budget column splits realized and planned the same way: planned spending in a
      category with no envelope for the month lands there, not in a category slot.
- [ ] The *include planned* toggle no longer decides whether planned amounts exist on this tab.
      It governs only whether `planned` is folded into the hero's headline Realized and Balance
      figures; the chart always shows both segments and the hero always states the planned
      total explicitly.
- [ ] For a month whose start is after today, the hero also expresses the committed total as a
      share of the total envelope (e.g. "63% committed"). This is a ratio of recorded
      commitments to envelope, not a projection of spend, so 003's no-pacing non-goal is
      untouched.
- [ ] A future month with resolved envelopes and zero commitments renders the chart with
      zero-height execution columns, not the empty state. The empty state is reserved for a
      month with no envelope at all, as today.

**Recurring occurrences**

- [ ] A recurring occurrence that has not happened yet contributes **nothing** to any figure on
      this tab unless it exists as a real transaction row. Projections dated after today are
      excluded from both `realized` and `planned`.
- [ ] A recurring placeholder that exists as a real row with `status='planned'` — including the
      legacy rows reclassified by migration `066_recurring_placeholders_planned` — counts in
      `planned`, because it is a recorded commitment like any other.
- [ ] Projections dated on or before today keep counting in `realized`, unchanged. Rules with
      `auto_generate=false` are projected rather than materialized and would otherwise lose
      their past spending, breaking parity with `/budgets` on past months.
- [ ] `/budgets`, the dashboard budget metric and their previous-month comparison keep their
      current projection behaviour. The exclusion is scoped to the budget report.

**Numbers**

- [ ] For any month, `realized` per category equals what `/budgets` reports as actual for that
      month with *include planned* off, to the cent — same debit definition, same split
      adjustments, same credit-card accounting mode — **except** for recurring projections
      dated after today, which `/budgets` still counts and this tab deliberately does not
      (D3, D4).
- [ ] For any month, `realized + planned` equals `/budgets` actual with *include planned* on,
      to the cent, subject to the same single documented exception.
- [ ] For any future month, `budgeted` per category equals the envelope `/budgets` shows for
      that same month, including recurring-default-versus-override resolution.
- [ ] The hero shows total budgeted, total realized, total planned, the balance against the
      committed total, and the out-of-budget total, with the existing sign colouring.
- [ ] A planned credit-card instalment lands in the same month here as it does in the card's
      bill view, under both `cash` and `accrual` accounting modes and honouring an
      `effective_bill_date` override.
- [ ] All amounts are in the user's primary currency, formatted with the user's locale.

**Cross-cutting**

- [ ] The Collection-filter notice, privacy masking, and the 20-plus-category legibility
      requirement from 003 all hold for the new segments, tooltip rows and hero figures.
- [ ] Every new user-facing string exists in all nine locale files, keeping `i18n.test.ts`
      key-parity green.
- [ ] Backend tests cover: a future anchor month with envelopes and planned rows; a future
      month whose only recurring occurrence is a projection (contributes nothing) versus the
      same occurrence as a real planned row (counts); a past month with an unpromoted planned
      entry; the current month with both kinds of spending; the out-of-budget split;
      `latest_month` with no forward data, with forward data, and beyond the 12-month cap; and
      that `/budgets` output is byte-identical before and after the change.

## Constraints & Dependencies

**Decisions locked before planning** (rationale belongs in `plan.md`):

| #  | Decision |
| -- | -------- |
| D1 | Forward navigation is **Month mode only**. Range keeps ending at today, and no forward preset is added. |
| D2 | The response carries `realized` and `planned` as separate quantities on this tab, and the chart always shows both. The *include planned* preference governs only the hero's headline totals. This is a deliberate narrowing of 002's D3 — a single global toggle still governs computed figures, but it may not make a future month read as empty. |
| D3 | Only **real transaction rows** count. Virtual recurring projections dated after today are excluded from the budget report entirely; projections dated on or before today keep counting in `realized`, which is what preserves past-month parity for `auto_generate=false` rules. `/budgets` and the dashboard are unaffected. |
| D4 | Forward navigation is bounded by `latest_month` on `/reports/bounds`: the furthest planned transaction, floored at the current month and capped at **+12 months**. The bound is a navigation affordance only; the endpoint keeps serving any valid month. |
| D5 | Overdue planned entries are counted in `planned`, not distinguished. 002 already surfaces them as an actionable set elsewhere. |
| D6 | Single primary currency is assumed. Foreign-currency planned entries — and 002's open FX question — are deferred to a future spec. |
| D7 | Where D3 makes this tab's figures differ from `/budgets` actual for the current month, the report is the one that is right, and the difference is documented rather than reconciled by changing `/budgets`. |

**Dependencies and existing surfaces this must not break:**

- The `MonthStepper` is shared by all five tabs and is stateless — bounds come from the parent
  (`frontend/src/components/month-stepper.tsx`). The forward bound therefore has to be
  computed per active tab in `reports.tsx`, and the month state clamped when the tab changes.
- `_actual_spending_by_category` is the single definition of "actual" behind `/budgets`, the
  dashboard budget metric and this report (`backend/app/services/budget_service.py:222-316`).
  Splitting realized from planned, and excluding future projections, must happen *inside* it
  under an explicit opt-in — forking the definition is how the three surfaces start disagreeing
  on the first edge case, the failure mode 003 was written to avoid.
- The four ordered steps in that helper (debits, own-split offsets, viewer shared spending,
  recurring projections) each need the status split applied consistently.
  `owner_split_offset_by_category` and `viewer_shared_spending_by_category` each forward
  `include_planned` into a single `counts_as_*` call, so both are one-line changes — but both
  are also used by the dashboard.
- `counts_as_user_pnl(include_planned)` defaults to `False` so an un-updated call site
  under-reports rather than over-reports. Any new predicate must preserve that direction of
  failure.
- `_get_recurring_projections` lives in `dashboard_service` and serves the dashboard too. Its
  return dicts already carry `date`, so date-filtering at the budget-report call site needs no
  signature change.
- A consequence of D3 worth stating: because `generate_pending`'s cutoff is today, no *new*
  future placeholders are ever written, so the only recurring rows appearing in future months
  are the legacy ones migration 066 reclassified. Two identical rules can therefore show
  different future months until the user records the commitment explicitly. That is a property
  of the data, not of the rule, and it is the price of counting only what was recorded.
- The global `credit_card_accounting_mode` (`cash` vs `accrual`) changes which date column
  buckets a transaction, and `reporting_date_col` honours the `effective_bill_date` override
  first.
- `is_realized()` exists precisely to keep planned rows out of balances and must stay that way
  (`backend/app/services/_query_filters.py:40-53`).
- The chart currently draws grouped bars — realized (custom shape with the rose overspend cap)
  beside a neutral envelope track. The planned segment has to stack onto realized while the
  track stays a separate group, and the cap has to keep working across the segment boundary.
- Budgets are workspace-scoped, so the Collection-filter notice from 003 still applies
  unchanged.

## Open Questions

All questions raised during drafting were resolved at approval (v0.2.0):

- **Forward horizon** — 12 months.
- **Recurring occurrences in future months** — excluded; only real planned rows count (D3).
  This also retires the unused intent behind `generate_pending(up_to=...)` pre-generating future
  months: nothing on this tab needs it.
- **Overdue planned entries** — counted, not distinguished (D5).
- **FX for planned foreign-currency entries** — out of scope; own spec when needed (D6).
- **Committed as a share of the envelope in the hero** — yes, for future months (best effort
  within the existing hero shell).

None open. New unknowns found during planning go here.

## Revision History

| Version | Date       | Author       | Change                                                                                                  |
| ------- | ---------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| 0.2.0   | 2026-08-20 | Victor Alves | Approved. Horizon fixed at 12 months; recurring projections excluded from future months in favour of real planned rows only (D3, reversing the earlier "projections count as planned"); overdue not distinguished; multi-currency deferred; committed-share added to the hero. |
| 0.1.0   | 2026-08-20 | Victor Alves | Initial draft. Month mode only (D1) decided at drafting.                                                |
