# Plan: Budget report future months

| Field        | Value      |
| ------------ | ---------- |
| ID           | 004        |
| Status       | Approved   |
| Version      | 0.2.0      |
| Spec         | ./spec.md  |
| Last updated | 2026-08-20 |

## Solution Overview

No migration, no new endpoint. Three changes, each small on its own:

1. **The spending helper learns a status scope.** `_actual_spending_by_category` — the single
   definition of "actual" behind `/budgets`, the dashboard metric and this report — gains an
   optional `planned_scope` (`"realized"` / `"planned"`). The budget report calls it twice, once
   per scope, and gets two clean maps instead of one preference-dependent map. Every existing
   caller passes nothing and behaves exactly as before, which is what keeps `/budgets` byte-identical.
2. **The budget report stops reading the preference.** With both quantities returned
   unconditionally, `get_budget_window_totals` no longer needs `user.include_planned` at all.
   The toggle becomes a presentation concern, applied in `BudgetReport` to the hero's headline
   figures only — exactly the narrowing spec D2 asks for, and a *removal* of preference-dependent
   backend behaviour rather than an addition.
3. **The stepper's forward bound becomes data-derived and tab-aware.** `/reports/bounds` gains
   `latest_month`; `reports.tsx` passes it as `maxDate` on the Budget tab only and clamps the
   month when the user leaves the tab.

D3 (only real rows count) costs one line: the projection step is skipped for the planned scope
and date-filtered to `<= today` for the realized scope. Since projections and materialized rows
are complementary by construction (`_get_recurring_projections` starts at
`rec.next_occurrence`), nothing can be double-counted, and nothing virtual reaches a future
month.

The frontend work is concentrated in the chart: the execution column becomes a two-segment
stack, and the rose overspend cap has to survive the segment boundary.

## Architecture & Components

```
  GET /api/reports/bounds                GET /api/reports/budget?anchor_month=2026-11
        │                                              │
        │ + latest_month                               ▼
        ▼                              report_service.get_budget_report()
  get_earliest_transaction_month()         • window resolution unchanged
  get_latest_planned_month()   ── NEW      • months_list unchanged
     max reporting_date_col of                        │
     status='planned' rows,                           ▼
     floored at this month,          budget_service.get_budget_window_totals()
     capped at +12 months               ├── _build_budget_map(month)          (unchanged)
                                        ├── _actual_spending_by_category(planned_scope="realized")
                                        └── _actual_spending_by_category(planned_scope="planned")
                                                      │
                                                      ▼
                                    rows{budgeted, realized, planned}
                                    + out_of_budget, out_of_budget_planned
                                                      │
        /budgets ─── get_budget_vs_actual() ───────────┘  same helper, no scope passed,
        dashboard                                          behaviour unchanged
```

```
frontend
  pages/reports.tsx
    maxDate = isBudget ? parseMonth(bounds.latest_month) : new Date()
    handleSelectTab: leaving budget with month > current month → clamp
  components/reports/BudgetReport.tsx
    <Bar dataKey="realized" stackId="execution" shape={<RealizedBar/>} />
    <Bar dataKey="planned"  stackId="execution" shape={<PlannedBar/>}  />   NEW
    <Bar dataKey="budgeted" />                    (separate group, unchanged)
    hero: + planned metric, preference-driven balance, committed share on future months
  lib/budget-report-utils.ts
    datum += planned, committed;  over = committed > budgeted
```

### Files touched

| File | Change |
| ---- | ------ |
| `backend/app/services/_query_filters.py` | `planned_scope` on `counts_as_pnl`, `counts_as_user_pnl`, `owner_split_offset_by_category`, `viewer_shared_spending_by_category` |
| `backend/app/services/budget_service.py` | `planned_scope` on `_actual_spending_by_category`; `CategoryWindowTotals.planned`; two-pass `get_budget_window_totals`, preference no longer read |
| `backend/app/services/report_service.py` | map the new figures; `get_latest_planned_month` |
| `backend/app/schemas/report.py` | `ReportBoundsResponse.latest_month`; row/summary planned fields |
| `backend/app/api/reports.py` | return `latest_month` from `/bounds` |
| `frontend/src/types/index.ts` | mirror the schema changes |
| `frontend/src/lib/budget-report-utils.ts` | planned in the datum, committed-basis `over` |
| `frontend/src/components/reports/BudgetReport.tsx` | stacked segment, cap across segments, hero figures |
| `frontend/src/pages/reports.tsx` | tab-aware `maxDate`, clamp on tab change |
| `frontend/src/locales/*.json` (9) | new keys |
| `backend/tests/` | new module for the future-month cases |
| `frontend/src/lib/budget-report-utils.test.ts` | committed-basis cases |

## Technical Decisions (mini-ADRs)

### Decision: a status scope inside the shared helper, not a query in the report service

- **Context:** the report needs realized and planned separately; `/budgets` and the dashboard
  must not move. The spec's parity criteria are only achievable if all three run the same code.
- **Decision:** add `planned_scope: str | None = None` to `_actual_spending_by_category` and to
  the two split helpers it calls. `None` keeps today's `include_planned` behaviour verbatim;
  `"realized"` forces `status != 'planned'`; `"planned"` forces `status == 'planned'`. The
  report calls the helper twice.
- **Alternatives considered:** (a) one pass returning `dict[cat, (realized, planned)]` — fewer
  queries, but it forces a `GROUP BY status` through the offset and shared-spending helpers,
  which the dashboard also calls, so the blast radius is much larger for a report that runs once
  per tab view; (b) a dedicated query in `report_service` — cheap now, guaranteed to drift from
  `/budgets` on the first edge case, which is exactly what 003's plan refactored away.
- **Consequences:** roughly double the queries for this one endpoint. Accepted: it is a
  read-only report, already several queries deep, and correctness by shared construction is the
  property the spec bought. `planned_scope` overrides `include_planned` when both are given —
  documented in the docstring, and only the report passes it.

### Decision: the budget report becomes preference-free

- **Context:** spec D2 says the toggle may not decide whether a future month has data. Today
  `get_budget_window_totals` reads `user.include_planned` and bakes it into one figure.
- **Decision:** return both quantities always; stop reading the preference in the service. The
  toggle is applied in `BudgetReport` to the hero headline only.
- **Alternatives considered:** keep the preference in the backend and add a second set of
  fields — two sources of truth for the same number, and the endpoint's meaning would still
  depend on a user setting invisible in its response.
- **Consequences:** the endpoint's response is now a pure function of (workspace, month), which
  makes it cacheable and testable without a user fixture. The `queryClient.invalidateQueries`
  on `['reports']` in the toggle becomes unnecessary for this tab but stays — it is shared with
  the other tabs, which do still depend on the preference.

### Decision: filter projections by date at the budget-report call site only

- **Context:** D3 excludes virtual occurrences from future months, but projections dated on or
  before today must keep counting or `auto_generate=false` rules lose their past spending and
  past-month parity with `/budgets` breaks.
- **Decision:** inside `_actual_spending_by_category`, step 4 skips entirely when
  `planned_scope == "planned"`, and keeps only `proj["date"] <= today` when
  `planned_scope == "realized"`. With `planned_scope=None` — every other caller — step 4 is
  untouched.
- **Alternatives considered:** date-filtering `_get_recurring_projections` itself (would change
  the dashboard's forward-looking figures, out of scope); treating projections as planned (the
  earlier draft of D3, reversed at approval — it would credit the user with commitments they
  never recorded).
- **Consequences:** for the *current* month this tab reports less than `/budgets`, by exactly
  the projections dated later this month. That is spec D7, and it is the one divergence the
  parity criteria carve out. The plan does not attempt to reconcile it; `/budgets` is out of
  scope.

### Decision: `latest_month` from planned rows, bucketed by `reporting_date_col`

- **Context:** recurring envelopes resolve for any future month, so an unbounded stepper pages
  forever through empty months. D4 fixes the bound to the user's own commitments, capped at 12
  months.
- **Decision:** `max(reporting_date_col(accounting_mode))` over `status='planned'` rows that
  the report would actually count (same `is_ignored` / category exclusions), floored at the
  current month and capped at `+12`.
- **Alternatives considered:** raw `Transaction.date` — a planned credit-card instalment would
  then extend the bound to a month *before* the one it is reported in, so the last reachable
  month could exclude the very row that made it reachable. Fixed `+12` regardless of data —
  simpler, but reintroduces the empty-months paging the goal rules out.
- **Consequences:** one extra aggregate query on `/bounds`, which is already a bounds query.
  The bound moves as the user records commitments, which is the intent.

### Decision: one stacked execution column, texture for planned, cap across the boundary

- **Context:** the column already carries category identity in its hue and overspend in a rose
  cap (003). Planned has to be distinguishable without spending either channel.
- **Decision:** `realized` and `planned` share `stackId="execution"`; the envelope track stays
  a separate group. Planned keeps the category's hue and adds a diagonal-line `<pattern>`
  generated per distinct category colour, ids derived from the hex. The overspend cap is
  computed on `committed = realized + planned` and painted by each segment on its own top
  pixels: `excess = committed − budgeted`, then per segment
  `capHeight = min(excess, segmentValue) × (height / segmentValue)`. Rose solid over realized,
  rose patterned over planned, so texture keeps saying "planned" even inside the cap.
- **Alternatives considered:** a third grouped bar (three bars per slot × 20 categories is
  unreadable, and the spec caps nothing at 20); a different hue for planned (spends the
  identity channel the chart uses for categories).
- **Consequences:** `RealizedBar`'s current proportional maths moves into a shared helper both
  shapes call, since neither segment can compute the cap from its own value alone. Zero-value
  segments must return `null` before dividing.

### Decision: clamp the month on tab change, don't give the Budget tab its own month state

- **Context:** the stepper and the `month` URL parameter are shared across tabs. Only Budget may
  go past the current month.
- **Decision:** keep one month state. `maxDate` is `isBudget ? latest_month : today`, and
  `handleSelectTab` clamps `month` to the current month when leaving Budget with a future
  selection, which the existing state→URL effect mirrors into the URL.
- **Alternatives considered:** per-tab month state (a second source of truth, and a shared URL
  stops describing one selection); leaving the future month selected on other tabs (four empty
  charts, the outcome the spec's third problem describes).
- **Consequences:** stepping forward on Budget and switching tabs silently moves the month back.
  Acceptable — the alternative is showing a month those tabs cannot report on — and the clamp is
  visible in the stepper label.

### Decision: row `difference` and `percentage_used` move to the committed basis

- **Context:** both fields exist in `BudgetReportRow`, and the tooltip recomputes them locally
  instead of reading them — they have no consumer today.
- **Decision:** redefine both against `realized + planned` and keep them, so the payload is
  self-consistent for any future consumer. `summary.balance` keeps its realized-only meaning
  and a new `committed_balance` carries the other; the hero picks by preference rather than
  doing arithmetic.
- **Consequences:** no visual change now. A field's meaning shifts silently for any external
  API consumer, which for a self-hosted app with no public API contract is acceptable; it is
  noted in the schema comments.

## Data Model / Contracts

No migration. No model change.

### `GET /api/reports/bounds`

```diff
 class ReportBoundsResponse(BaseModel):
     earliest_month: str | None
+    latest_month: str          # YYYY-MM; furthest planned commitment, floored at
+                               # the current month, capped at +12 months
```

### `GET /api/reports/budget`

```diff
 class BudgetReportRow(BaseModel):
     budgeted: float
-    realized: float
+    realized: float          # status != 'planned' only, preference-independent
+    planned: float           # status == 'planned' only, preference-independent
-    difference: float        # budgeted - realized
+    difference: float        # budgeted - (realized + planned)
-    percentage_used: float | None
+    percentage_used: float | None   # (realized + planned) / budgeted * 100

 class BudgetReportSummary(BaseModel):
     budgeted: float
     realized: float
+    planned: float
     balance: float                  # budgeted - realized (unchanged)
+    committed_balance: float        # budgeted - realized - planned
     out_of_budget: float            # realized, outside every envelope
+    out_of_budget_planned: float    # planned, outside every envelope
```

`BudgetReportMeta` is unchanged — `start_date` already tells the frontend whether the window is
in the future, so no "is future" flag is needed.

### Service contracts

```python
# _query_filters.py
def counts_as_pnl(include_planned: bool = False, planned_scope: str | None = None): ...
def counts_as_user_pnl(include_planned: bool = False, planned_scope: str | None = None): ...
# planned_scope: None → today's behaviour; "realized" → status != 'planned';
#                "planned" → status == 'planned'. Wins over include_planned when set.

# budget_service.py
@dataclass
class CategoryWindowTotals:
    ...
    realized: Decimal
    planned: Decimal        # NEW

async def get_budget_window_totals(...) -> tuple[list[CategoryWindowTotals], Decimal, Decimal]:
    """... returns (rows, out_of_budget_realized, out_of_budget_planned)."""
```

### Chart data

```diff
 export interface BudgetChartDatum {
   realized: number
+  planned: number
+  /** realized + planned — the basis for `over` and the tooltip's committed row. */
+  committed: number
   budgeted: number | null
-  over: boolean        // realized > budgeted
+  over: boolean        // committed > budgeted
 }
```

The out-of-budget column is pushed when `out_of_budget + out_of_budget_planned > 0`, with
`realized`/`planned` filled from the two summary fields and `budgeted: null` as today.

### New i18n keys (all nine locales)

`reports.planned`, `reports.committed`, `reports.committedShare` (`"{{percent}}% committed"`),
`reports.plannedLegend`.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| The `planned_scope` plumbing accidentally changes `/budgets` or the dashboard | Medium | High | Default `None` preserves every existing call path; a test asserts `get_budget_vs_actual` output is unchanged for a fixture containing planned rows, projections and splits |
| The rose cap breaks when one stack segment is zero | High | Medium | Cap maths in one shared helper with explicit zero guards; unit tests in `budget-report-utils.test.ts` for realized-only, planned-only and mixed overspend |
| Current-month divergence from `/budgets` reads as a bug to the user | Medium | Medium | It is spec D7; the hero states realized and planned separately, so the missing quantity is visibly "not committed" rather than silently absent. Revisit only with real data |
| Per-category `<pattern>` defs bloat the SVG with 20+ categories | Low | Low | One pattern per *distinct colour*, deduped, ids derived from the hex |
| Clamping the month on tab change surprises the user | Low | Low | Only ever moves backward to the current month, and the stepper label shows it immediately |
| Legacy 066 planned rows make two identical recurring rules behave differently in future months | Medium | Low | Stated in the spec's constraints; the rule ("only recorded commitments count") is uniform, the data is not |

## Test Strategy

**Backend** (`backend/tests/test_budget_report_future_months.py`, plus additions to the existing
budget-report module):

| Criterion | Test |
| --------- | ---- |
| future month with envelopes and planned rows | anchor month `+2` with a recurring envelope and two planned debits → `budgeted` from the envelope, `planned` = the debits, `realized` = 0 |
| projection contributes nothing; the same occurrence as a row does | one active recurring rule with a future occurrence → future month reports 0; materialize it as `planned` → the same month reports its amount, once |
| past-month projection still counts | `auto_generate=false` rule with an occurrence before today → counted in `realized` |
| unpromoted planned entry in a past month | present in `planned`, absent from `realized` |
| current month with both | posted + planned rows in the same category → both figures correct, projections later this month excluded |
| out-of-budget split | planned and realized spending in an unbudgeted category → both out-of-budget fields |
| preference independence | same assertions with `include_planned` true and false → identical response |
| `/budgets` unchanged | `get_budget_vs_actual` snapshot over a fixture with planned rows, projections and splits, before/after |
| `latest_month` | no forward data → current month; planned row 3 months out → that month; planned row 30 months out → capped at +12; credit-card planned row with `effective_bill_date` in a later month → the later month |
| beyond the horizon | `anchor_month` past `latest_month` → 200, envelopes, zero commitments |
| accounting modes | planned credit-card instalment lands in the same month under `cash` and `accrual`, and honours `effective_bill_date` |

**Frontend** (`budget-report-utils.test.ts`): committed-basis `over`; cap geometry for
realized-only, planned-only and mixed overspend; out-of-budget column present when only its
planned half is non-zero; coverage line unaffected.

**Manual QA:** step forward from the current month to `+12` and confirm the arrow disables;
switch tabs from a future month and confirm the clamp; toggle *include planned* and confirm the
chart does not change while the hero headline does; privacy mode on a future month; a Collection
filter still shows the notice.

## Out of Scope (deferred implementation choices)

- Any change to `_get_recurring_projections` itself, and to how the dashboard consumes it.
- Retiring `generate_pending`'s unused `up_to` future pre-generation intent — a separate
  cleanup, now that nothing needs it.
- Caching the now preference-free budget report response.
- Surfacing the current-month divergence from `/budgets` in the UI.

## Revision History

| Version | Date       | Author       | Change       |
| ------- | ---------- | ------------ | ------------ |
| 0.2.0   | 2026-08-20 | Victor Alves | Approved; no content change from the draft |
| 0.1.0   | 2026-08-20 | Victor Alves | Initial plan |
