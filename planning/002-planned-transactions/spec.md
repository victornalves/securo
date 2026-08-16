# Spec: Planned transactions

| Field        | Value        |
| ------------ | ------------ |
| ID           | 002          |
| Type         | Feature      |
| Status       | Approved     |
| Version      | 1.1.0        |
| Author       | Victor Alves |
| Last updated | 2026-08-15   |
| Jira         | —            |
| Confluence   | —            |

## Context & Problem

Securo already distinguishes two states of a **real** transaction: `Transaction.status` holds
`posted` or `pending`, populated by all three bank providers (SimpleFIN, Pluggy, Enable Banking)
and reconciled on sync, including a twin-matcher for providers that re-emit a settled transaction
under a new `external_id`.

What Securo has no representation for is a transaction that **has not happened yet** — an entry the
user records because they know it is coming: next month's rent, a scheduled transfer, an upcoming
credit-card purchase they have already committed to. Today such an entry is indistinguishable from
a realized one:

- `TransactionCreate` accepts any date with no upper bound, and new rows inherit the column default
  `status="posted"`. A future-dated entry is stored as *settled*.
- `status` is never used to gate any aggregate. It does not appear in a single balance, dashboard,
  budget, or report query — the only two places that read it are credit-card closed-bill view
  carve-outs. Pending and future-dated rows count as fully realized everywhere.
- `RecurringTransaction.generate_pending(up_to=...)` materializes **future** occurrences as real
  `Transaction` rows, and those rows also inherit `status="posted"`. Recurrence is already inflating
  realized spending for months that have not happened.

The consequence is not a missing convenience — it is a wrong number. Recording a known-future debit
today silently increases this month's realized spending, distorts budget actuals, and misstates the
account balance.

The existing `RecurringTransaction` machinery does not close this gap. Commitments are commonly
tracked as **individually entered transactions** — an instalment plan recorded as ten separate rows
labelled `(1/10)` … `(10/10)`, a bill entered once for next month — rather than as a recurrence rule.
That workflow is deliberate: instalments have a fixed end and a known schedule, and a rule is heavier
than the thing it describes. So the planned state has to be a property of an ordinary transaction,
available at the moment of entry, not a by-product of configuring a recurrence.

Two shapes of commitment have to work equally well, and both are ordinary planned transactions:

- A future credit-card instalment — the purchase already happened, so amount and date are fixed and
  the entry never needs revising.
- A utility bill entered at whatever figure the user considers representative, overwritten with the
  real one once it is known.

The amount is simply the best number available at any moment. The user keeps it current by editing
it; the system does not track how firm it is or how it changed (D6).

The user need is the opposite of what the current model delivers: recording a future commitment
should make the *forecast* more accurate without touching what has already happened. This matters in
two places specifically:

- **Checking accounts** — knowing what the balance will be after the commitments already made.
- **Credit cards** — knowing how much of the limit is really committed and what future bills will
  total. Securo already has the machinery for the second half of this (`CreditCardBill`,
  `credit_limit`, `statement_close_day`/`payment_due_day`, and Brazilian close-day cycle math in
  `credit_card_service.compute_effective_date`); it simply has nothing future to feed it.

## Goals

- Let a user record a transaction that has not happened yet, on both checking and credit-card
  accounts, without corrupting any figure that describes what already happened.
- Give the user three distinguishable readings of their money: what has settled, what is
  outstanding, and what is committed but still in the future.
- Make committed credit-card limit and future bill totals reflect planned purchases, reusing the
  existing bill-cycle assignment rules.
- Let the user promote a planned transaction to realized when it actually occurs, without losing the
  categorization and context they already entered.
- Make unpromoted planned transactions whose date has passed visible, so stale entries are noticed
  rather than silently double-counting.
- Stop recurring placeholders for future dates from being recorded as settled.

## Non-Goals

- **Automatic reconciliation of planned → realized.** Promotion is a deliberate user action in this
  scope. Auto-matching incoming synced transactions against planned entries is deferred, even though
  `recurring_match_service` already provides most of the machinery.
- Changing the existing `pending` → `posted` reconciliation, the twin-matcher, or any provider
  mapping. Planned is additive; realized-state handling is untouched.
- Per-view or per-widget controls for including planned amounts. Scope is a single global toggle.
- New forecasting logic. The existing recurring projections, `ProjectedTransaction`, and the
  historical-baseline cash-flow model stay as they are; this feature adds a new *input*, not a new
  model.
- Splitting `date` into purchase vs. posting timestamps. `date` / `effective_date` /
  `effective_bill_date` stay as they are; SimpleFIN's `transacted_at` and Enable Banking's
  `value_date` remain collapsed into `date`.
- Planned transfers between accounts (`transfer_pair_id` mechanics) and planned investment holdings.
- Notifications, reminders, or scheduled execution of planned entries.
- Any notion of amount confidence — estimated vs. exact — and any record of how a planned amount
  changed before it was realized. Editing the amount of a planned transaction is an ordinary edit
  with no history, no audit trail, and no variance reporting between planned and actual.

## User Stories / Use Cases

- As an account holder, I want to record a debit I know is coming, so that my projected balance
  reflects commitments I have already made.
- As an account holder entering a transaction dated in the future, I want it treated as planned
  without having to remember to say so, so that the safe outcome is the default one.
- As a credit-card user, I want to enter the remaining instalments of a purchase I already made as
  individual future entries, so that my committed limit and future bills are right — without having
  to model them as a recurrence rule.
- As an account holder, I want to record a bill at an estimated amount and correct it when the real
  figure arrives, so that a commitment with an unknown value still shows up in my forecast.
- As an account holder, I want my current balance and this month's realized spending to ignore
  entries that have not happened, so that they still reconcile with what the bank says.
- As a credit-card user, I want purchases I have planned to consume my committed limit, so that I
  know how much room I actually have — not how much the bank thinks I have.
- As a credit-card user, I want a planned purchase to land in the correct future bill according to
  the card's closing day, so that future invoice totals are trustworthy.
- As a budget owner, I want to see, on demand, what my budget looks like including everything I have
  committed to, so that I can tell whether the rest of the month fits.
- As an account holder, I want to mark a planned entry as realized when it happens, so that I don't
  re-enter data I already categorized.
- As an account holder, I want to be told when a planned entry's date has passed and I never
  confirmed it, so that I notice it before it distorts a total.

## Acceptance Criteria

**Recording**

- [ ] A transaction can be created and edited in a `planned` state on both checking and credit-card
      accounts, with a date in the past, present, or future.
- [ ] A transaction can be moved between `planned` and realized states without changing its ID,
      category, payee, notes, tags, attachments, split, or installment metadata.
- [ ] Manual transaction entry exposes an explicit planned / realized control.
- [ ] On **creation**, that control defaults to planned when the date is in the future and to
      realized otherwise.
- [ ] Once the user sets the control by hand, subsequent date changes within the same entry do not
      override their choice.
- [ ] The date-driven default applies at creation only. Editing an existing transaction's date never
      changes its state automatically.
- [ ] Synced transactions do not expose the control — their state is provider-driven.
- [ ] A planned transaction whose date has passed stays planned until the user promotes it. Nothing
      promotes it on the basis of time alone.

**Isolation from realized figures**

- [ ] With the *include planned* toggle **off**, no planned transaction contributes to: account
      settled balance, dashboard income/expense totals, spending-by-category, budget actuals,
      balance history for past dates, or cash-flow report actuals.
- [ ] An account's settled balance never includes planned transactions, in either toggle state.
- [ ] Planned transactions are excluded from every aggregate by an explicit status predicate, not by
      relying on a date bound.

**The global toggle**

- [ ] A single user-level *include planned* setting controls whether planned amounts are folded into
      dashboard totals, budget actuals, spending-by-category, and cash-flow projections.
- [ ] The toggle's state persists across sessions and is discoverable from the views whose numbers it
      changes.
- [ ] When the toggle is on, every view whose figures include planned amounts indicates that fact,
      so a total is never ambiguous about what it counts.
- [ ] The toggle governs **figures only**. Planned transactions remain listed in the transactions
      view in both toggle states; hiding them from a list is done with the list's own state filter,
      never by the toggle.
- [ ] Turning the toggle off never removes a row from any list, and turning it on never adds one.

**Visibility**

- [ ] Planned transactions are visually distinct from realized ones in every list where both appear.
- [ ] The transactions list can be filtered by state (planned / pending / posted). Today no status
      filter exists in the API or the filter bar.
- [ ] The transaction state column is discoverable by default rather than hidden behind the column
      picker, where it currently sits with `defaultVisible: false`.
- [ ] Planned transactions whose date has passed and that were never promoted are surfaced as an
      actionable "overdue planned" set with a count, reachable from the main navigation or dashboard.

**Credit cards**

- [ ] A planned transaction on a credit-card account is assigned to a bill cycle by the same rules as
      a realized one, including the close-day convention and the `effective_bill_date` manual
      override.
- [ ] Committed credit limit accounts for planned purchases, and the UI distinguishes credit
      committed from credit already drawn.
- [ ] A planned credit-card purchase consumes committed limit from the moment it is recorded, not
      when its date arrives. Future instalments of an already-made purchase are committed today.
- [ ] Future bill totals include planned purchases assigned to that cycle.
- [ ] Planned transactions do not alter a **closed** bill's total or its `minimum_payment`.

**Recurring placeholders**

- [ ] Placeholders generated by `generate_pending` for dates after today are created in the `planned`
      state, not `posted`.
- [ ] A migration reclassifies existing future-dated recurring placeholders to `planned`, leaving
      past-dated rows and all non-recurring rows untouched.
- [ ] The migration is reversible and reports how many rows it changed.

**Sync safety**

- [ ] Provider sync never promotes, overwrites, or deletes a planned transaction — including the
      duplicate-detection and twin-matcher paths.
- [ ] An incoming synced transaction that corresponds to a planned entry results in both rows
      existing, with the planned one flagged as overdue, rather than a silent merge.

**Quality**

- [ ] New user-facing strings exist in all locale files currently shipped in the repo.
- [ ] Aggregate behavior in both toggle states is covered by automated tests for: balance, dashboard
      totals, budget actuals, credit-card committed limit, and bill assignment.

## Constraints & Dependencies

**Decisions locked before planning** (rationale belongs in `plan.md`):

| # | Decision |
| - | -------- |
| D1 | Planned is a third value on the existing `Transaction.status` column, not a separate table or entity. |
| D2 | Promotion from planned to realized is a manual user action only. No automatic matching in this scope. |
| D3 | A single global *include planned* toggle governs aggregates. No per-view controls. It affects computed figures only — never which rows appear in a list. Listing is controlled independently by the transactions filter. |
| D4 | Fixing recurring placeholders written as `posted` is in scope, migration included. It is a product correctness fix; it does not serve the manual-entry workflow that motivates this spec. |
| D5 | Manual entry uses an explicit planned / realized control, defaulting from the date at creation time only, and yielding permanently to the user once touched. |
| D6 | Estimated vs. exact committed amounts are **not modelled**. A planned amount is simply the current best figure; the user overwrites it in place when the real one arrives. No estimate flag, no amount history, no before/after comparison. |

**Dependencies and existing surfaces this must not break:**

- `_query_filters.reporting_date_col` and `counts_as_pnl` / `counts_as_user_pnl` are the shared
  entry points for reporting queries; neither currently filters on `status`. Any status predicate
  should land here rather than being scattered across call sites.
- The global `credit_card_accounting_mode` (`cash` vs `accrual`) already changes which date column
  aggregates use. Planned handling must be correct under both modes.
- `is_ignored` on `Transaction` and `Category` already excludes rows from aggregates; planned is an
  orthogonal axis and the two must compose.
- Balance computation (`_account_balance_at`, `_daily_deltas`) uses raw `Transaction.date` and
  ignores the accounting mode, unlike P&L aggregation which uses `reporting_date_col`. This
  asymmetry is pre-existing and must be understood before changing balance behavior.
- The frontend duplicates credit-card cycle math in `account-detail.tsx`; bill-assignment changes
  must keep both implementations in agreement.
- Multi-currency fields (`amount_primary`, `fx_rate_used`) are populated at write time; planned
  entries are written before the rate that will apply is known.

## Open Questions

- ~~Does the `_account_balance_at` back-solve for connected accounts distort today's balance when a
  future-dated row exists?~~ **Resolved: yes, the defect exists today.** The delta window
  (`dashboard_service.py:885-892`) has no upper date bound, so a future debit *inflates* the reported
  balance by its amount. The manual-account branch is correct. Fixed within this spec rather than as
  a separate Bug spec, because the fix and the planned-status exclusion modify the same expression
  and shipping one without the other would produce wrong figures — see `plan.md`.
- ~~Does the *include planned* toggle affect listing as well as counting?~~ **Resolved:** figures
  only. Planned transactions are always listed; the list has its own state filter.
- Should planned entries be included in CSV/OFX export, and if so, marked how?
- Which FX rate applies to a planned foreign-currency entry — the rate at planning time, the live
  rate at display time, or none until promotion?
- What happens to planned transactions when their account is closed or deleted?
- ~~Should promotion allow adjusting the amount as part of the same action?~~ **Resolved (D6):** the
  amount is an ordinary editable field. The user corrects it in place when the real figure arrives,
  independently of promotion; no dedicated flow is needed.
- Recurring already offers `auto_generate=false`, which projects virtually instead of materializing
  rows. With planned placeholders, do the two mechanisms still both earn their place, or does one
  become redundant?
- Instalment plans are entered as independent rows with the sequence encoded in the description
  (`(3/10)`), while the schema carries dedicated `installment_number` / `total_installments` /
  `installment_total_amount` / `installment_purchase_date` columns that are currently populated only
  by providers. Should planned entry offer to fill those, so a plan can be grouped and its remaining
  balance computed? Out of scope here; candidate for its own spec.
- Should promoting one instalment of a plan offer to act on the remaining ones, or is each row always
  promoted independently?

## Revision History

| Version | Date       | Author       | Change        |
| ------- | ---------- | ------------ | ------------- |
| 0.1.0   | 2026-08-15 | Victor Alves | Initial draft |
| 1.1.0   | 2026-08-15 | Victor Alves | Balance open question resolved during planning: the connected-account back-solve defect is confirmed and is fixed inside this spec rather than as a separate Bug spec. |
| 1.0.0   | 2026-08-15 | Victor Alves | Approved. All six decisions closed; remaining open questions are technical and resolved during planning. |
| 0.4.0   | 2026-08-15 | Victor Alves | Toggle scope resolved: it changes computed figures only, never list membership. Planned transactions are always listed; the transactions filter controls visibility independently. |
| 0.3.0   | 2026-08-15 | Victor Alves | D6 resolved: estimated vs. exact amounts are not modelled. Removed the corresponding acceptance criteria, added the exclusion to Non-Goals, and resolved the open question on amount adjustment at promotion time — the amount is an ordinary editable field. |
| 0.2.0   | 2026-08-15 | Victor Alves | Manual-entry workflow (individually entered instalments, no recurrence rules) established as the driving use case; added the planned/realized control and its date-driven default (D5); added estimated vs. exact committed amounts as pending decision D6; credit-card commitment clarified as effective at entry, not at date. |
