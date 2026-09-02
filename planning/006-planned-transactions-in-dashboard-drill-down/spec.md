# Spec: Planned transactions in dashboard drill-down

| Field        | Value        |
| ------------ | ------------ |
| ID           | 006          |
| Type         | Feature      |
| Status       | Approved     |
| Version      | 1.1.0        |
| Author       | Victor Alves |
| Last updated | 2026-09-01   |
| Jira         | —            |
| Confluence   | —            |

## Context & Problem

Spec 002 introduced the `planned` transaction state and a single user-level *include planned*
preference that folds committed-but-not-yet-realized amounts into computed figures. The dashboard
honors it: `get_summary`, `get_spending_by_category`, `get_monthly_trend` and `get_balance_history`
all resolve `user.include_planned` and pass it into `counts_as_user_pnl(include_planned)`.

The dashboard's drill-down drawer does not. Clicking a figure on the dashboard opens
`TransactionDrillDown`, which lists the rows behind that figure by calling
`GET /transactions?user_pnl_only=true`. That flag is implemented as
`base_query.where(Account.is_closed == False, counts_as_user_pnl())` — with no argument, so
`include_planned` falls back to its `False` default. The drawer is therefore **always realized-only**,
including when the preference that produced the figure it is explaining is switched on.

The visible consequence: with *include planned* on, a user clicks a category bar showing R$ 4.200 and
gets a drawer whose footer totals R$ 3.100. Nothing on screen accounts for the missing R$ 1.100. The
drawer's stated job is to explain the figure, and in that state it contradicts it.

This is not a hypothetical edge. `user_pnl_only` has exactly one caller in the whole codebase — this
drawer. The flag exists to mirror the dashboard's P&L definition, and it mirrors an outdated version
of it: the definition became preference-dependent in spec 002 and the flag was never updated.

Five figures open the drawer, and they do not all behave the same way:

- **Income**, **Expenses**, **spending by category**, and **a day on the balance-flow chart** are all
  computed with the preference applied. Their drawers should follow it.
- **Uncategorized** is different. `pending_categorization` is a plain row count with no status
  predicate at all — it counts planned rows in *both* preference states. So its drawer under-reports
  against its own badge permanently, regardless of the toggle, and "follow the preference" would not
  fix it. A planned row with no category genuinely does need categorizing; the badge is a worklist,
  not a P&L figure.

The drawer is already not a plain list of stored rows: it merges virtual recurring projections from
`dashboard.projectedTransactions` alongside real transactions, precisely so the list adds up to the
chart. Adding planned rows continues that existing design rather than departing from it.

**Double counting was checked and does not occur.** `_get_recurring_projections` and
`get_projected_transactions` both enumerate occurrences from `RecurringTransaction.next_occurrence`
forward, and `generate_pending` advances `next_occurrence` past every occurrence it materializes. An
occurrence is therefore either a stored `planned` row or a projection, never both. This is the same
composition `get_spending_by_category` already sums.

**Tension with spec 002 that must be resolved, not glossed over.** 002's D3 reads: the toggle
"affects computed figures only — never which rows appear in a list", with the acceptance criterion
"turning the toggle off never removes a row from any list, and turning it on never adds one". Read
literally, this spec violates it. The intent behind D3 was to protect the *transactions view* — a
browse surface where the user is looking for rows, and where a preference silently hiding data would
be hostile. The drill-down drawer is the opposite kind of surface: it exists only to decompose a
single computed figure, is reachable only by clicking that figure, and is titled after it. D3's rule
is therefore narrowed to lists the user navigates, and spec 002 is amended to record the narrowing.

## Goals

- Make the drill-down drawer's contents and footer total agree with the dashboard figure that opened
  it, in both preference states.
- Let a user who has *include planned* on see **which** commitments make up a figure, not just that
  they are counted somewhere.
- Keep planned rows, recurring projections and realized rows distinguishable from one another inside
  the drawer, so a total is never ambiguous about what it counts.
- Make the uncategorized drawer list every row its badge counts, so the worklist matches the number
  that sent the user to it.

## Non-Goals

- Any change to the transactions view (`/transactions`). Its contents stay governed by its own state
  filter and remain identical in both preference states — 002 D3 continues to hold there in full.
- Any change to balances. An account balance still answers "what does the bank hold?" and never
  includes planned rows, in either preference state.
- A new toggle, a per-drawer control, or any second way to express the preference. The existing
  global checkbox is the only control.
- Promoting a planned transaction from inside the drawer. Planned rows are real transactions, so
  clicking one already opens the transaction dialog where the planned/realized control lives; no new
  affordance is added.
- Changing how the dashboard figures themselves are computed. This spec moves the drawer to match
  the figures, never the reverse.
- Fixing the other, non-planned divergences between the uncategorized badge and its drawer (the badge
  counts rows in closed accounts and rows excluded by `is_ignored`, which the drawer drops via
  `counts_as_user_pnl`). Pre-existing and unrelated to planned state — see Open Questions.
- Extending drill-down to reports or budgets. `TransactionDrillDown` has one consumer, the dashboard,
  and it stays that way here.

## User Stories / Use Cases

- As a user with *include planned* on, I want the drawer's total to match the bar I clicked, so that
  I don't have to reconcile two numbers Securo showed me one click apart.
- As a user with *include planned* on, I want to see which planned commitments are inflating a
  category, so that I can decide whether to reschedule or cancel one.
- As a user with *include planned* off, I want the drawer to keep showing only what actually
  happened, so that the realized reading stays clean.
- As a user opening a planned row from the drawer, I want to edit or promote it in the usual dialog,
  so that acting on what I just found doesn't require navigating elsewhere.
- As a user clicking the "categorize now" badge, I want the drawer to contain as many rows as the
  badge promised, so that the worklist is trustworthy.

## Acceptance Criteria

**Agreement with the figure**

- [ ] With *include planned* **on**, the drawer opened from spending-by-category lists the planned
      debits in that category and month, and its footer total equals the category figure on the chart.
- [ ] The same holds for the drawers opened from monthly **Income**, monthly **Expenses**, and a
      **day** on the balance-flow chart.
- [ ] With *include planned* **off**, none of those four drawers contains a planned row, and each
      total is unchanged from today's behavior.
- [ ] The **uncategorized** drawer lists planned rows in **both** preference states, matching the
      status-agnostic count on its badge.
- [ ] Toggling the preference while a drawer is open, or reopening it afterwards, shows the updated
      contents — no stale cached result from the previous preference state.

**Distinguishability**

- [ ] A planned row in the drawer is visually marked as planned, using the same badge vocabulary as
      the transactions view.
- [ ] A planned row is distinguishable from a virtual recurring projection: the two are different
      things (one is a stored, editable row; the other is not yet a row at all) and must not share an
      undifferentiated marker.
- [ ] Clicking a planned row opens the transaction dialog, exactly as clicking a realized row does.
      Recurring projections remain non-clickable.
- [ ] When a drawer contains planned rows, its footer states how many and for how much, in addition
      to the single total that matches the figure.
- [ ] The footer shows exactly one total. Splitting it into competing realized/planned figures is
      not acceptable, because neither half would match the chart.

**Correctness**

- [ ] No occurrence is counted twice as both a stored planned row and a recurring projection, in any
      drawer, under either accounting mode (`cash` and `accrual`).
- [ ] Planned rows in the drawer respect every exclusion already applied there: transfer pairs,
      `is_ignored` transactions and categories, `treat_as_transfer` categories, settlement rows, and
      closed accounts.
- [ ] A foreign-currency planned row contributes to the total on the same terms as a realized one
      (via `amount_primary`, skipped when it cannot be converted).
- [ ] The drawer's collection (account) scoping applies to planned rows as it does to realized ones.

**Documentation and quality**

- [ ] Spec 002 carries a revision entry recording that D3 is narrowed to navigable lists and pointing
      to this spec, so the two documents cannot be read as contradicting each other.
- [ ] Any new user-facing string exists in all locale files currently shipped in the repo.
- [ ] Automated tests cover both preference states for: a category drawer, the uncategorized drawer,
      and the absence of projection/planned double counting.

## Constraints & Dependencies

**Decisions locked before planning** (rationale belongs in `plan.md`):

| # | Decision |
| - | -------- |
| D1 | The drill-down drawer follows the *include planned* preference. This narrows spec 002's D3: the preference governs computed figures and the drill-down that explains one, but never a list the user navigates to browse. Spec 002 is amended, not silently contradicted. |
| D2 | It applies to every drawer opened from a preference-dependent figure — Income, Expenses, category, day — not only the category one. Limiting it to the category drawer would relocate the inconsistency rather than remove it. |
| D3 | The **uncategorized** drawer includes planned rows in both preference states. It explains a status-agnostic worklist count, not a P&L figure, so the preference is not the right governor for it. |
| D4 | The preference is resolved **server-side**, as at every other computed-figure site; the client never transmits it. The API expresses D3 with an explicit override parameter on the transactions endpoint, defaulting to the preference when omitted. `user_pnl_only` keeps its documented meaning — "rows that count toward dashboard/user totals" — which is what makes it preference-dependent; today's unconditional `include_planned=False` makes that contract false. |
| D5 | The footer shows one total, matching the figure, plus a secondary line naming the planned portion. Two headline figures were rejected: neither would equal the chart, which is the problem this spec exists to fix. |

**Dependencies and existing surfaces this must not break:**

- `transaction_service.get_transactions` keeps two independent axes: `statuses` (visibility, driven by
  the transactions filter) and the P&L predicate. The preference must reach only the second. The
  comment at the `statuses` filter guards this and needs updating rather than deleting.
- `counts_as_pnl` / `counts_as_user_pnl` default `include_planned=False` deliberately, so an
  un-updated call site under-reports rather than over-reports. That default stays; only the API
  boundary resolves the preference, mirroring `dashboard_service`.
- `user_pnl_only` currently has exactly one caller. Changing its semantics is low-risk today and must
  be documented so the next caller inherits the correct contract.
- The drawer's React Query key is `['drill-down', filter]`, and `IncludePlannedToggle` invalidates
  `dashboard`, `budgets`, `reports` and `accounts` — not `drill-down`. Cache coherence has to be
  handled explicitly or the drawer will serve the previous preference state.
- Recurring projections must keep coming from `next_occurrence` forward. Any future change that
  projects from an earlier point would introduce the double counting this spec relies on being absent.
- Both accounting modes (`cash`, `accrual`) change which date column buckets a transaction; planned
  rows must land in the same month as the figure counts them.

## Open Questions

- ~~Should overdue planned rows (date passed, never promoted) be marked as such inside the drawer?~~
  **Resolved during planning: no.** The dashboard header already carries an overdue-planned count
  pill next to the toggle, and each drawer row shows its date. A third treatment would add noise to a
  state that is already surfaced. The drawer does make the condition *diagnosable* for the first
  time, though: it now shows the same rows the chart counts, so a commitment appearing twice — the
  planned row plus the synced real one — becomes visible instead of being an unexplainable total.
- ~~The uncategorized badge also diverges from its drawer on rows in closed accounts and on
  `is_ignored` rows, independently of planned state.~~ **Resolved: separate Bug spec.** Logged as
  backlog item 007. It is a different defect with a different cause, and folding it in here would
  make this spec's reconciliation criteria untestable.
- ~~Should the drawer indicate *at the top* that its figures include planned amounts?~~ **Resolved:
  the footer line does it.** "Includes N planned · R$ X" states the exact fact in the same screen
  where a header banner would state the general one, so the banner is strictly less informative.
- ~~When *include planned* is off, is there value in a passive hint that N planned rows exist in this
  slice but are not counted?~~ **Resolved: no.** It would reintroduce exactly the ambiguity about
  what a figure counts that the toggle exists to remove.

## Revision History

| Version | Date       | Author       | Change        |
| ------- | ---------- | ------------ | ------------- |
| 1.1.0   | 2026-09-01 | Victor Alves | All four open questions resolved during planning: no overdue marker in the drawer, the footer line carries the planned disclosure, no passive hint when the toggle is off, and the uncategorized badge's non-planned divergences move to backlog item 007. |
| 1.0.0   | 2026-09-01 | Victor Alves | Approved. All five decisions closed; the narrowing of spec 002's D3 to navigable lists is accepted and becomes an acceptance criterion of this spec. Open questions are presentation-level and are resolved during planning. |
| 0.1.0   | 2026-09-01 | Victor Alves | Initial draft |
