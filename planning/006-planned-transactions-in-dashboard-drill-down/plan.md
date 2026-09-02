# Plan: Planned transactions in dashboard drill-down

| Field        | Value      |
| ------------ | ---------- |
| ID           | 006        |
| Status       | Approved   |
| Version      | 1.0.0      |
| Spec         | ./spec.md  |
| Last updated | 2026-09-01 |

## Solution Overview

No migration, no new endpoint, no new user control. The whole feature is the correction of one
default argument, plus the presentation work that makes the corrected figure legible.

1. **`user_pnl_only` stops lying about its own contract.** The flag is documented as returning
   "rows that count toward dashboard/user income/expense totals", but it applies
   `counts_as_user_pnl()` with no argument, so `include_planned` falls back to `False`
   unconditionally. `get_transactions` gains a `pnl_include_planned` parameter that reaches exactly
   that one predicate and nothing else.
2. **The API boundary resolves the preference, as every other computed-figure site does.** The
   endpoint's new `pnl_include_planned` query param is tri-state: omitted → read
   `ctx.user.include_planned`; `true`/`false` → override. The override exists solely to express
   spec D3 (the uncategorized worklist always counts planned rows), and it is the reason this is a
   parameter rather than an unconditional server-side read.
3. **The drawer's merge logic moves into a pure module and learns about planned rows.** The
   transaction/projection merge currently lives in a `useMemo` inside the component, which is why
   it has never been tested. It becomes `lib/drill-down-utils.ts` — the same treatment spec 004 gave
   `budget-report-utils.ts` — with the planned/projected distinction as an explicit field rather
   than the current single `isProjected` boolean.
4. **Presentation: one total, one explanatory line, two distinct badges.** The footer total needs no
   arithmetic change at all — it already sums whatever is in the list, so it starts matching the
   chart the moment planned rows arrive. A secondary line names the planned portion (D5). Violet
   becomes the planned marker exclusively; recurring projections move to the primary-tinted pill the
   transactions view already uses for recurring-linked rows, so the two "not realized" states stop
   sharing one appearance.

The subtle part is not the filter — it is cache coherence. `['drill-down', filter]` does not contain
the preference, and `IncludePlannedToggle` invalidates `dashboard`, `budgets`, `reports` and
`accounts` but not `drill-down`. Without a fix, flipping the toggle and reopening a drawer serves the
previous state's rows from cache.

## Architecture & Components

```
  IncludePlannedToggle ──writes──► user.preferences.include_planned
        │                                      │
        │ (client already holds it via useAuth)│ (server reads it via ctx.user)
        ▼                                      ▼
  TransactionDrillDown                  GET /api/transactions
    filter.uncategorized ? true              ?user_pnl_only=true
      : includePlanned                       &pnl_include_planned=<tri-state>
        │                                      │
        │ queryKey: ['drill-down',             ▼
        │   filter, pnlIncludePlanned]   list_transactions()
        │                                 pnl_include_planned is None
        ▼                                   → ctx.user.include_planned
  lib/drill-down-utils.ts                    │
    buildDrillDownItems({                    ▼
      transactions,   ← real rows      transaction_service.get_transactions()
      projections,    ← virtual          if user_pnl_only:
      filter })                            counts_as_user_pnl(pnl_include_planned)
      → DisplayItem[] with                 └─ the ONLY consumer of the new arg
         kind: 'realized'|'planned'|'projected'
    summarizeDrillDown(items, currency)
      → { absTotal, plannedCount, plannedTotal }
        │
        ▼
  footer: one total (= the chart figure)
        + "includes N planned · R$ X" when plannedCount > 0
```

**Untouched by design:** `_query_filters.py` (`counts_as_user_pnl` already accepts the flag),
the `statuses` visibility filter, `export_transactions`, every dashboard service, and the
`/transactions` page.

## Technical Decisions (mini-ADRs)

### Decision: fix `user_pnl_only`'s predicate rather than add a second flag

- **Context:** the drawer needs planned rows folded into the same P&L definition the dashboard uses.
  `user_pnl_only` already claims to be that definition.
- **Decision:** thread `pnl_include_planned` into the existing `counts_as_user_pnl()` call inside the
  `user_pnl_only` branch. No new filtering concept, no new endpoint.
- **Alternatives considered:**
  - *Second query with `statuses=['planned']`, merged client-side.* Does not work: `user_pnl_only`
    would still drop the rows via `counts_as_user_pnl()`, and dropping `user_pnl_only` from that
    second call would leak transfers, ignored rows and closed accounts into the drawer.
  - *Have the drawer filter planned rows in on the client from a separate unfiltered fetch.* Same
    leak, plus it would duplicate the P&L exclusion rules in TypeScript — the exact scattering
    `_query_filters.py` exists to prevent.
  - *Make `user_pnl_only` read the preference unconditionally, with no parameter.* Rejected because
    spec D3 needs the uncategorized drawer to include planned rows in *both* preference states, which
    an unconditional read cannot express.
- **Consequences:** `user_pnl_only`'s results become preference-dependent. Acceptable and in fact
  intended — it has exactly one caller — but the docstring must say so, because a future caller
  would otherwise inherit a surprise.

### Decision: tri-state parameter, preference resolved server-side

- **Context:** the client already knows the preference (`useAuth`), so it could simply send a boolean.
  But no other Securo surface transmits it — `dashboard_service`, `report_service` and
  `budget_service` all read `user.include_planned` themselves.
- **Decision:** `pnl_include_planned: Optional[bool] = None`. `None` means "the user's preference";
  an explicit value overrides it.
- **Alternatives considered:** *client always sends the boolean.* Rejected: it makes every future API
  consumer responsible for knowing about the preference, and the safe default (omit → realized-only)
  would silently under-report for anyone who forgot.
- **Consequences:** the default direction of failure changes for `user_pnl_only`: omitting the param
  now yields the preference rather than realized-only. `counts_as_pnl`'s own `include_planned=False`
  default is untouched, so the SQL-helper layer keeps failing safe; only the API boundary — the layer
  that legitimately knows who is asking — resolves the preference.

### Decision: the preference goes in the React Query key, not in the toggle's invalidation list

- **Context:** the drawer's cached result must not survive a preference change.
- **Decision:** `queryKey: ['drill-down', filter, pnlIncludePlanned]`.
- **Alternatives considered:** *add `'drill-down'` to the four keys `IncludePlannedToggle`
  invalidates.* Rejected: it puts knowledge of the drawer inside the toggle, and the list of keys
  there is already a maintenance hazard — a fifth consumer would have to remember to register.
  Keying on the value is self-maintaining, since the value is genuinely part of the request.
- **Consequences:** one extra cache entry per preference state. Negligible, and it means toggling back
  and forth is instant rather than refetching.

### Decision: violet means planned, primary means recurring

- **Context:** the drawer currently draws recurring projections with a violet pill labelled
  "Recurring". The transactions view uses violet for `status === 'planned'` and a primary-tinted pill
  for recurring-linked rows. Adding planned rows to the drawer under the current styling would put
  two different concepts in the same colour.
- **Decision:** planned rows take the violet pill with `transactions.plannedBadge`, matching the
  transactions view. Projections keep `transactions.recurringBadge` but move to the primary-tinted
  pill, also matching the transactions view.
- **Alternatives considered:** *a third colour for projections.* Rejected — it would invent a
  vocabulary that exists nowhere else in the product.
- **Consequences:** the projection badge changes appearance for users who never enable the
  preference. This is a deliberate correction: it was borrowing the planned colour before planned
  existed as a visible state in this drawer.

### Decision: extract the merge into `lib/drill-down-utils.ts`

- **Context:** the frontend has no component-testing stack — only pure-logic tests under
  `src/lib/` (`budget-report-utils.test.ts`, `rule-match-utils.test.ts`, `selection-utils.test.ts`).
  The behaviour worth testing here (which rows survive the filter, what the totals are, no double
  counting) is pure.
- **Decision:** move `buildDrillDownItems` and `summarizeDrillDown` into `src/lib/drill-down-utils.ts`
  and unit-test them there.
- **Alternatives considered:** *introduce `@testing-library/react` and test the component.* Rejected
  as out of proportion: it adds a testing stack to the repo to cover logic that is pure once
  extracted, and the spec's criteria are all expressible against the pure functions.
- **Consequences:** the component keeps only data fetching and rendering. The `useMemo` becomes a
  one-line call.

### Decision: the footer line, not a header banner, discloses that planned amounts are counted

- **Context:** spec 002 requires that every view whose figures include planned amounts says so. The
  drawer's header already carries the accrual note in that slot.
- **Decision:** disclosure lives in the footer, where it can be specific: "includes N planned · R$ X".
- **Alternatives considered:** *a header banner mirroring the accrual note.* Rejected: it would state
  the general fact while the footer states the exact one, so the banner is strictly less informative
  in the same screen.
- **Consequences:** one new locale key instead of two.

## Data Model / Contracts

**No schema change.** No migration.

`GET /api/transactions` gains one optional query parameter:

| Param | Type | Default | Meaning |
| ----- | ---- | ------- | ------- |
| `pnl_include_planned` | `bool?` | `null` | Only meaningful together with `user_pnl_only`. `null` → use the caller's `include_planned` preference. `true`/`false` → override it. Never affects the `statuses` visibility filter. |

`transaction_service.get_transactions` gains the matching keyword-only argument
`pnl_include_planned: bool = False` — resolved, not tri-state, because the service is below the layer
that knows who is asking. Its default stays `False` so an un-updated caller under-reports rather than
over-reports, matching `counts_as_pnl`.

**Frontend contract** — `src/lib/drill-down-utils.ts`:

```ts
export type DrillDownKind = 'realized' | 'planned' | 'projected'

export type DisplayItem = {
  key: string
  description: string
  date: string
  type: 'debit' | 'credit'
  amount: number
  amountPrimary: number | null
  currency: string
  categoryIcon: string | null
  categoryName: string | null
  categoryColor: string | null
  kind: DrillDownKind          // replaces the current `isProjected: boolean`
  attachmentCount: number
  transaction: Transaction | null
}

export function buildDrillDownItems(input: {
  transactions: Transaction[]
  projections: ProjectedTransaction[]
  filter: DrillDownFilter | null
}): DisplayItem[]

export function summarizeDrillDown(
  items: DisplayItem[],
  userCurrency: string,
): { absTotal: number; plannedCount: number; plannedTotal: number }
```

`kind` is derived as `'projected'` for projections and, for stored rows,
`tx.status === 'planned' ? 'planned' : 'realized'`. Client-side projection filtering (type,
category, uncategorized, date bounds) moves across unchanged — it is already correct.

`summarizeDrillDown` keeps the existing conversion rule verbatim: native amount when the currency
matches the user's, `amountPrimary` when it does not, and the row is **skipped** when neither is
available. `plannedTotal` uses the same rule so the two figures cannot disagree about a row.

**New locale key** (all 10 files):

```
dashboard.drillDownPlannedNote: "Includes {{count}} planned · {{total}}"
```

`src/locales/i18n.test.ts` already enforces key parity and placeholder parity across locales, so a
missed file fails the suite rather than shipping.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| A future caller of `user_pnl_only` inherits preference-dependent results unknowingly | Medium | Medium | State it in the query-param description and the service docstring; the parameter name says `pnl_` so it cannot be mistaken for a visibility filter |
| Stale drawer contents after toggling the preference | High if unhandled | High — it is the exact bug class this spec fixes | Preference value is part of the query key; a test asserts the two states produce different keys |
| Planned rows push a busy month past the drawer's `limit: 200` | Low | Low | Out of scope to fix; the limit is pre-existing and applies equally to realized rows. Noted so it is not mistaken for a regression |
| Overdue planned rows double-count against a synced real row inside the drawer | Medium | Medium, but pre-existing | The drawer now shows the same rows the chart counts, so it *reveals* the state rather than creating it. The dashboard header already carries an overdue-planned count pill next to the toggle |
| The projection badge restyle surprises users who never enable planned | Certain | Cosmetic | Deliberate; recorded as an ADR consequence above |
| Reconciliation still off by an FX rounding step between chart and drawer | Low | Low | The chart converts server-side per currency bucket; the drawer converts per row. Tests assert equality in single-currency scenarios and tolerance in mixed ones |

## Test Strategy

**Backend** — new file `backend/tests/test_planned_transactions_drill_down.py`, following the
fixture style of `test_planned_transactions_dashboard.py` (copy-then-assign on
`user.preferences`, day-15 dates to dodge month-boundary flakiness).

| Spec criterion | Test |
| -------------- | ---- |
| Preference off → no planned row in the four figure drawers | `user_pnl_only=true` with preference off returns realized only (regression guard on today's behaviour) |
| Preference on → planned rows appear | Same request with preference on returns the planned row, and the count moves by exactly one row / the amount by exactly `PLANNED_AMOUNT` |
| Uncategorized drawer includes planned in both states | `pnl_include_planned=true` with preference **off** returns the planned row; `pnl_include_planned=false` with preference **on** excludes it |
| Footer total equals the chart figure | Call `/dashboard/spending-by-category` and `/transactions?user_pnl_only=true&category_id=…` for the same month with preference on; assert the category total equals the summed rows |
| Planned rows respect existing exclusions | Planned rows in a closed account, under an `is_ignored` category, and with `is_ignored=True` stay excluded with preference on |
| Both accounting modes | The reconciliation test parametrised over `cash` and `accrual` |
| Visibility axis untouched | `/transactions` without `user_pnl_only` returns identical results in both preference states — the 002 D3 guarantee for the navigable list |

**Frontend** — new file `frontend/src/lib/drill-down-utils.test.ts` (vitest, pure functions):

| Spec criterion | Test |
| -------------- | ---- |
| Planned rows classified distinctly | `buildDrillDownItems` maps `status: 'planned'` to `kind: 'planned'` and projections to `'projected'` |
| No double counting | A projection and a planned row for the same description/date both survive (they are complementary by construction) and each is counted once |
| Single total matching the figure | `summarizeDrillDown` returns one `absTotal` covering all kinds |
| Planned portion reported | `plannedCount` / `plannedTotal` cover only `kind: 'planned'`, excluding projections |
| FX handling | A foreign-currency row with no `amountPrimary` is skipped by both `absTotal` and `plannedTotal` |
| Projection filtering preserved | Existing type / category / uncategorized / date-bound filtering of projections is unchanged after extraction |

`i18n.test.ts` covers the locale criterion with no new test needed.

**Manual QA** — one pass on the dashboard with the toggle on: click a category bar and confirm the
footer total equals the bar, that planned rows carry the violet badge, that clicking one opens the
transaction dialog, and that the "categorize now" drawer's row count matches its badge.

## Out of Scope (deferred implementation choices)

- Marking overdue planned rows inside the drawer. Already surfaced by the dashboard header pill.
- The uncategorized badge's non-planned divergences (closed accounts, `is_ignored`) — candidate for
  its own Bug spec.
- Raising the drawer's 200-row limit or paginating it.
- Any drill-down on the reports or budgets pages.

## Revision History

| Version | Date       | Author       | Change       |
| ------- | ---------- | ------------ | ------------ |
| 1.0.0   | 2026-09-01 | Victor Alves | Approved. Five ADRs closed; the projection badge restyle was flagged as a visible change beyond the request and accepted. |
| 0.1.0   | 2026-09-01 | Victor Alves | Initial plan |
