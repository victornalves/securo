# Plan: Budget report tab

| Field        | Value      |
| ------------ | ---------- |
| ID           | 003        |
| Status       | Draft      |
| Version      | 0.1.0      |
| Spec         | ./spec.md  |
| Last updated | 2026-08-15 |

## Solution Overview

The tab is a new read-only endpoint plus a self-contained frontend component; no schema
migration, no change to how budgets are stored or resolved.

The spec's hard requirement is that every number reconcile with `/budgets` to the cent. The
only way to guarantee that is to make both screens run **the same code**, so the core of this
plan is a refactor: the actual-spending computation currently inlined twice inside
`budget_service.get_budget_vs_actual` (once for the month, once for the previous month) is
extracted into one window-parameterized helper. Every dependency it uses already accepts
arbitrary `(start, end)` bounds — `owner_split_offset_by_category`,
`viewer_shared_spending_by_category`, `_get_recurring_projections`,
`reporting_date_col(accounting_mode)` — so the extraction is mechanical and the helper works
unchanged for a 1-month or a 24-month window. `get_budget_vs_actual` then becomes two calls to
it, and parity with `/budgets` holds by construction rather than by care.

On top of that, `GET /api/reports/budget` resolves its window exactly like the other three
report endpoints (same `anchor_month` / `months` / `period` helpers), sums each month's
envelope across the window, and returns a category-shaped payload. The frontend adds a fifth
tab that renders a grouped column chart from it.

## Architecture & Components

```
                     GET /api/reports/budget?anchor_month=2026-08
                                    │
                     api/reports.py │ (params, validation)
                                    ▼
              report_service.get_budget_report()
                 • resolves the window (anchor_month | months | period=ytd)
                 • enumerates the calendar months inside it
                                    │
                                    ▼
              budget_service.get_budget_window_totals()
                 ├── _build_budget_map(month)  ── per month, existing fn ──┐
                 │      envelope per category, override > recurring        │ sum + coverage
                 └── _actual_spending_by_category(start, end)  ── NEW ─────┤
                        (extracted from get_budget_vs_actual)              │
                                    │                                      ▼
                                    ▼                          rows + out_of_budget
                        /budgets and the dashboard
                        keep calling get_budget_vs_actual,
                        which now delegates to the same helper
```

Frontend:

```
pages/reports.tsx
  ├── REPORT_TABS += { key: 'budget' }          (last, after Money Map)
  ├── useQuery<BudgetReportResponse>            (enabled only on the budget tab)
  ├── mode defaults to 'month' on tab select    (unless the user pinned a mode)
  └── renders <BudgetReport />                  (replaces hero + trend + breakdown)

components/reports/BudgetReport.tsx             NEW — hero row + grouped column chart
lib/budget-report-utils.ts                      NEW — pure helpers, unit-tested
```

### Files touched

| File | Change |
| ---- | ------ |
| `backend/app/services/budget_service.py` | Extract `_actual_spending_by_category`; add `get_budget_window_totals` |
| `backend/app/services/report_service.py` | Add `get_budget_report` (window resolution + delegation) |
| `backend/app/schemas/report.py` | Add `BudgetReportRow`, `BudgetReportSummary`, `BudgetReportMeta`, `BudgetReportResponse` |
| `backend/app/api/reports.py` | Add `GET /api/reports/budget` |
| `backend/tests/test_budget_report.py` | New — window aggregation, coverage, out-of-budget bucket |
| `frontend/src/lib/api.ts` | Add `reports.budget(...)` |
| `frontend/src/types/index.ts` | Mirror the new response types |
| `frontend/src/lib/budget-report-utils.ts` | New — chart-row building, over-budget flag, coverage label |
| `frontend/src/components/reports/BudgetReport.tsx` | New — the whole tab body |
| `frontend/src/pages/reports.tsx` | Tab entry, query, mode default, interval hiding |
| `frontend/src/locales/*.json` (9 files) | New `reports.*` keys |

## Technical Decisions (mini-ADRs)

### Decision: extract the actual-spending computation instead of writing a report query

- **Context:** the spec requires cent-level parity with `/budgets`. The realized side is not a
  simple `SUM(amount)`: it applies `counts_as_user_pnl()`, the credit-card reporting-date
  column, owner-split offsets (with a pop-when-non-positive rule), viewer shared spending, and
  projected recurring transactions — five steps whose *order* matters.
- **Decision:** extract those steps out of `get_budget_vs_actual` into
  `_actual_spending_by_category(session, workspace_id, user_id, start, end, primary_currency,
  accounting_mode, include_uncategorized=False)`, preserving the current order exactly. Rewrite
  `get_budget_vs_actual` as two calls to it (current month, previous month). The new report
  calls the same helper with a wider window.
- **Alternatives considered:** a fresh aggregation query in `report_service` — rejected, it
  would reproduce five subtle rules and drift from `/budgets` on the first edge case, which is
  precisely the failure the spec forbids. Calling `get_budget_vs_actual` in a loop, once per
  month — rejected, it recomputes the previous month for every month (double the queries) and
  returns per-month objects that would then have to be re-summed.
- **Consequences:** one refactor commit touches a function that `/budgets`, the dashboard, and
  the MCP budget tools all depend on. It must be behaviour-preserving and land on its own,
  with the existing `test_budget_service.py` / `test_budgets_api.py` suites as the guard.

### Decision: window resolution in `report_service`, budget math in `budget_service`

- **Context:** the tab must accept the same period inputs as its neighbours (`anchor_month`,
  `months`, `period=ytd`), whose resolution already lives in `report_service` helpers
  (`_month_bounds`, `_report_start_date`).
- **Decision:** `report_service.get_budget_report` owns parameter → window translation and
  response assembly; `budget_service.get_budget_window_totals` owns envelopes and actuals.
- **Alternatives considered:** putting everything in `budget_service` — rejected, it would have
  to import `report_service` private helpers or fork the window semantics, and forked window
  semantics is how tabs start disagreeing about what "6M" means.
- **Consequences:** one extra hop; the budget module stays free of report-period concepts.

### Decision: month-aligned windows, current month contributes a full envelope

- **Context:** `_report_start_date` returns a month-aligned start but the window ends *today*,
  so range mode always ends mid-month. Envelopes only exist per whole month. Note also that the
  helper approximates months as 30 days before snapping to day 1, so a "6M" preset can span
  seven calendar months — the month list must therefore be derived from the *resolved start
  date*, never from the `months` count.
- **Decision:** enumerate every calendar month from the resolved start through the month
  containing the end date, inclusive. Each contributes its full envelope. Realized keeps the
  raw window (ending today).
- **Alternatives considered:** pro-rating the current month's envelope by elapsed days —
  rejected, pacing is an explicit non-goal and `/budgets` does not do it either. Excluding the
  partial month — rejected, it would hide the month the user cares about most.
- **Consequences:** early in a month, range totals show a full envelope against a few days of
  spending. Accepted and already true of `/budgets`.

### Decision: dedicated response schema, not `ReportResponse`

- **Context:** `ReportResponse` is time-series shaped (`trend`, `composition`,
  `category_trend`, `meta.series_keys`, `meta.interval`). This tab has categories on the X axis
  and no time axis at all.
- **Decision:** a separate `BudgetReportResponse` (see contracts below).
- **Alternatives considered:** bending the data into `trend` (one "date" per category) —
  rejected, it would make every existing consumer of `ReportResponse` handle a shape that isn't
  a trend, for the sole benefit of reusing a hero card we are replacing anyway.
- **Consequences:** the shared hero card doesn't apply to this tab; `BudgetReport.tsx` renders
  its own summary row using the same card shell and typography.

### Decision: resolve envelopes by looping `_build_budget_map` per month

- **Context:** envelope resolution (month override wins, else most recent recurring default
  with `month <= M`) is non-trivial and already implemented per month.
- **Decision:** call `_build_budget_map` once per month in the window — at most 24 iterations
  of two indexed queries, and exactly one iteration in month mode, which is the dominant case.
- **Alternatives considered:** one bulk fetch of all budget rows plus in-Python resolution —
  faster for 2Y windows, but it re-implements the resolution rule a second time, which is the
  drift risk this plan is built to avoid. Documented as the optimization to reach for **if**
  profiling shows the 2Y window is slow; the fix would be to extract the resolution into a pure
  function shared by both callers, not to duplicate it.
- **Consequences:** up to ~48 lightweight queries on the widest window.

### Decision: keep the tab's pure logic in `lib/budget-report-utils.ts`

- **Context:** the frontend suite is vitest over `lib/` only — there are no component tests in
  this repo (`rule-match-utils.test.ts`, `selection-utils.test.ts`, `locales/i18n.test.ts`).
- **Decision:** put chart-row assembly, the over-budget predicate, and the coverage label in a
  pure module with unit tests; keep `BudgetReport.tsx` to rendering.
- **Alternatives considered:** introducing React Testing Library for this feature — rejected as
  scope creep; it is a repo-wide decision, not this tab's to make.
- **Consequences:** the component itself is verified by manual QA, as is every other page here.

### Decision: gate the tab under an active Collection filter

- **Context:** `385d967` established the precedent on the dashboard — the budget metric hides
  when a collection narrows the view, because `/budgets/comparison` takes no account filter and
  a filtered actual against a workspace-wide envelope is a meaningless comparison.
- **Decision:** when `activeAccountIds !== null`, render an explanatory notice instead of the
  chart, and skip the query entirely.
- **Alternatives considered:** filtering actuals by account and leaving envelopes whole —
  rejected, it manufactures under-spend. Adding an account dimension to budgets — a data-model
  change well outside this spec.
- **Consequences:** the tab is unavailable while a collection is active, consistently with the
  dashboard.

## Data Model / Contracts

No migration. No change to the `budgets` table.

### `GET /api/reports/budget`

| Param | Type | Default | Notes |
| ----- | ---- | ------- | ----- |
| `months` | int, 1–24 | 12 | Rolling window, ignored when `anchor_month` is set |
| `period` | `"ytd"` \| null | null | Same semantics as the other report endpoints |
| `anchor_month` | `YYYY-MM` \| null | null | Month mode; scopes to that calendar month |

No `account_ids` parameter — budgets have no account dimension (see ADR above).

```python
class BudgetReportRow(BaseModel):
    category_id: uuid.UUID
    category_name: str
    category_icon: str
    category_color: str
    group_name: str | None = None
    budgeted: float          # sum of the effective envelope of each month in the window
    realized: float          # spending over the window, /budgets semantics
    difference: float        # budgeted - realized; positive = room left
    percentage_used: float | None   # realized / budgeted * 100; None when budgeted == 0
    months_in_window: int    # calendar months covered by the window
    months_budgeted: int     # of those, how many resolved an envelope > 0


class BudgetReportSummary(BaseModel):
    budgeted: float          # sum over rows
    realized: float          # sum over rows (budgeted categories only)
    balance: float           # budgeted - realized
    out_of_budget: float     # everything else, incl. uncategorized


class BudgetReportMeta(BaseModel):
    currency: str
    start_date: str          # YYYY-MM-DD, inclusive
    end_date: str            # YYYY-MM-DD, inclusive
    months_in_window: int
    anchor_month: str | None


class BudgetReportResponse(BaseModel):
    rows: list[BudgetReportRow]      # budgeted > 0 only, ordered by realized desc
    summary: BudgetReportSummary
    meta: BudgetReportMeta
```

Row membership follows the spec rule: a category is a row when its summed `budgeted` over the
window is `> 0`. Everything else — never budgeted, budgeted only at 0, and uncategorized
spending (`category_id IS NULL`) — is summed into `summary.out_of_budget`. Note that the
existing actuals query filters `category_id.isnot(None)`; the extracted helper takes
`include_uncategorized` so the report can count the null bucket while `/budgets` keeps its
current behaviour.

TypeScript mirrors these four types in `frontend/src/types/index.ts`.

### Chart data

`BudgetReport.tsx` builds one chart datum per row, plus a final synthetic datum for the
out-of-budget column (`budgeted: null`, so recharts draws no second bar):

```ts
{ key, label, color, realized, budgeted, over: realized > budgeted, coverage: '8/12' }
```

Rendered as a recharts `BarChart` with two `<Bar>` series (`realized`, `budgeted`), `<Cell>`
per datum to paint the over-budget bars in the rose used elsewhere for overspend, and the
out-of-budget column in a neutral tone. To satisfy the "legible at 20+ categories" criterion
the chart lives in an `overflow-x-auto` container with a computed width of
`max(containerWidth, rows * 84px)`, `XAxis interval={0}` with angled, truncated labels — a
squeezed `ResponsiveContainer` would drop labels silently, which the criterion forbids.

### Tab wiring

- `REPORT_TABS` gains `{ key: 'budget', labelKey: 'reports.budget', enabled: true }`, last.
- Range presets: the existing `HISTORICAL_RANGE_OPTIONS` (6M, YTD, 1Y, 2Y).
- Mode default: a `modePinnedByUser` ref is set when the user clicks the Range/Month toggle;
  selecting the Budget tab calls `setMode('month')` only when that ref is false and the URL
  carries no `mode`. This keeps the "unless the URL pins a mode" criterion honest without
  fighting the existing URL-sync effects, which write `?mode=` themselves.
- The interval selector's existing `hidden` condition gains `|| isBudget`.
- New i18n keys: `reports.budget`, `budgeted`, `realized`, `outOfBudget`, `budgetBalance`,
  `overBudget`, `budgetCoverage` (`"Budgeted in {{count}} of {{total}} months"`),
  `budgetCollectionNotice`, `noBudgets`, `percentUsed`.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| The `get_budget_vs_actual` refactor silently shifts `/budgets` or dashboard numbers | Medium | High | Pure extraction, no behaviour edits, landed as its own task/commit; `test_budget_service.py` and `test_budgets_api.py` must pass **unmodified** |
| Current-month realized includes projected recurring transactions, which reads as "already spent" | High | Medium | This is exactly what `/budgets` shows today; parity is the spec's requirement. Documented here; changing it is a separate spec for both screens at once |
| A 2Y window issues ~48 envelope queries | Low | Low | Bounded by `months le 24`; optimization path recorded in the ADR, to be taken only if profiling shows it |
| Partial envelope coverage reads as a blowout | Medium | Medium | `months_budgeted / months_in_window` in the payload and the coverage line in the tooltip (spec AC) |
| Many budgeted categories make the chart unreadable | Medium | Medium | Horizontal scroll container with a fixed per-category width, `interval={0}` labels |
| MCP budget tools consume `get_budget_vs_actual` too | Low | Medium | Same guard as the first row; `backend/mcp_server/tools/budgets.py` reviewed during the refactor task |

## Test Strategy

**Backend — `backend/tests/test_budget_report.py` (new), pytest + async session**

| Spec criterion | Test |
| -------------- | ---- |
| Realized matches `/budgets` to the cent | Same fixture through `get_budget_vs_actual` and the new report for one month; assert per-category equality |
| Budgeted matches `/budgets` for a month | Idem, on the envelope side, with a recurring default and a month override in play |
| Missing month counts as 0 | Category budgeted in 3 of 6 months: assert `budgeted` == sum of those 3, `months_budgeted == 3`, `realized` == the full 6-month spending |
| Envelope change across the window | Recurring 800 until April, 1000 from May: assert the sum tracks month by month |
| Row membership | Category with only a 0 envelope, and a category with no envelope: neither appears in `rows`; both land in `out_of_budget` |
| Out-of-budget bucket | Unbudgeted category spending **and** uncategorized (`category_id IS NULL`) spending both counted |
| Ordering | `rows` ordered by `realized` desc |
| Empty period | No budgets at all → `rows == []`, summary zeroed, `out_of_budget` still populated |
| Window resolution | `anchor_month` scopes to that month; `period=ytd` starts on Jan 1; `months` derives its month list from the resolved start date, not from the count |

**Backend — regression guard**

`test_budget_service.py`, `test_budgets_api.py`, `test_report_service.py` and
`test_report_service_coverage.py` run unmodified after the refactor. Any edit needed to those
files is a signal the extraction changed behaviour and must be re-examined, not accommodated.

**Frontend — vitest**

- `lib/budget-report-utils.test.ts`: chart-row assembly including the synthetic out-of-budget
  datum, the over-budget predicate at the exact boundary (`realized == budgeted` is *not*
  over), the coverage label, and empty input.
- `locales/i18n.test.ts` (existing) covers key parity and placeholder parity across the nine
  locales — it must stay green with the new keys.

**Manual QA**

Month stepping updates the chart; Range/Month toggle and the tab's month default behave as
specified, including browser back/forward; privacy mode masks bars, axis and tooltip; the
collection notice appears when a collection is active; a workspace with 20+ budgeted categories
scrolls and keeps every label; a workspace with no budgets shows the empty state; a value
cross-check against `/budgets` for the same month.

## Out of Scope (deferred implementation choices)

- Bulk envelope fetch with in-Python resolution (only if profiling demands it).
- Component-level frontend testing infrastructure.
- Drill-down from a column to its transactions.
- Splitting uncategorized spending out of the out-of-budget column.
- Any budget period other than the month.

## Revision History

| Version | Date       | Author       | Change       |
| ------- | ---------- | ------------ | ------------ |
| 0.1.0   | 2026-08-15 | Victor Alves | Initial plan |
