# Plan: Reports month filter

| Field        | Value      |
| ------------ | ---------- |
| ID | 001 |
| Status       | Approved   | <!-- Draft | Approved -->
| Version      | 0.2.0      |
| Spec         | ./spec.md  |
| Last updated | 2026-07-28 |

> Do not start this plan until the linked spec is **Approved**. (It is — v0.3.0.)

## Solution Overview

Add a "Month" mode to `/reports`, sitting alongside the existing rolling-window presets, backed
by a new `anchor_month` query param on the report endpoints. The frontend gets a segmented
Range/Month toggle; selecting Month shows the existing `MonthStepper` component (fixed to actually
respect a minimum-month bound) and forces daily granularity. The backend resolves `anchor_month`
into first/last-day-of-month bounds, reuses the existing `change_amount`/`change_percent` summary
fields but recomputes them against the previous calendar month, and — for cash-flow specifically —
disables forecasting/baseline entirely since projecting forward from a past month makes no sense.
A new lightweight `/api/reports/bounds` endpoint supplies the earliest navigable month. Per spec
v0.4.0, Money Map is in scope alongside the other three tabs — it shares the `/income-expenses`
data path (and therefore the same `anchor_month` support), so it gets the same Range/Month toggle;
it never has an interval toggle today and isn't getting one now, so daily-in-month-mode doesn't
apply to it.

## Architecture & Components

**Backend — touched:**
- `backend/app/api/reports.py` — add `anchor_month: str | None = Query(None, pattern="^\d{4}-\d{2}$")`
  to `get_net_worth`, `get_income_expenses`, `get_cash_flow`; add new `GET /bounds` route.
- `backend/app/services/report_service.py`:
  - new `_month_bounds(anchor_month: str) -> tuple[date, date]` (first/last day of month), shared
    by all three report functions as an alternative to `_report_start_date`'s rolling-window math.
  - new `_previous_month_change(current_value: float, previous_value: float) -> tuple[float, float | None]`
    (amount, percent), reused by all three functions in place of their current ad-hoc
    previous/current comparisons when `anchor_month` is set.
  - new `get_earliest_transaction_month(workspace_id) -> str | None` extracted from the existing
    inline earliest-date query in `_get_baseline_projection` (lines 1037-1049), reused by the new
    `/bounds` endpoint.
  - cash-flow branch: when `anchor_month` is set, skip forecast/baseline computation entirely and
    return only the historical actuals for that month.
- `backend/app/schemas/report.py` — new `ReportBoundsResponse { earliest_month: str | None }`. No
  change to `ReportResponse`/`ReportSummary` — `change_amount`/`change_percent` already exist.

**Frontend — touched:**
- `frontend/src/lib/api.ts` — thread `anchorMonth?: string` through `reports.netWorth`,
  `reports.incomeExpenses`, `reports.cashFlow`; add `reports.bounds()`.
- `frontend/src/pages/reports.tsx` — add `mode: 'range' | 'month'` and `month: string` state,
  synced to `useSearchParams` (`?mode=month&month=2026-03`) following the same pattern already
  used in `transactions.tsx`/`dashboard.tsx` (reports.tsx currently has none). Render `MonthStepper`
  when `mode === 'month'` on all four tabs, including Money Map (`isMoneyMap`, which today only
  gets `MONEY_MAP_RANGE_OPTIONS` and no interval toggle — that stays true in month mode too, only
  the date window changes). Force `interval = 'daily'` and disable the interval toggle in month
  mode for net worth/income-expenses/cash-flow (mirrors the existing tab-switch clamp at lines
  193-196). Preserve `rangeKey` and `month` independently across tab switches — switching tabs
  must not lose either.
- `frontend/src/components/month-stepper.tsx` — forward `minDate`/`maxDate` props through to the
  underlying `MonthPicker` (currently silently dropped at line 49); wire `minDate` from the new
  `reports.bounds()` query, `maxDate` to the current month.

No new components are introduced — this reuses `MonthStepper`/`MonthPicker`/`month-utils.ts` as-is
(plus the one bug fix above) rather than building a new picker.

## Technical Decisions (mini-ADRs)

### Decision: single `anchor_month` param, mutually exclusive with rolling-window params

- **Context:** the three endpoints today only support `months`/`period=ytd`/`days`, always
  anchored to `date.today()`.
- **Decision:** add one new optional query param, `anchor_month: str` (`YYYY-MM`), to all three
  endpoints. When present, it fully determines the date range (whole calendar month) via a new
  shared `_month_bounds()` helper; `months`/`period`/`days` are ignored when `anchor_month` is set.
- **Alternatives considered:** generic `from`/`to` date-range params — rejected, the spec's
  Non-Goals explicitly rule out arbitrary custom ranges in favor of month-level granularity only,
  and a single validated `YYYY-MM` string is a smaller, harder-to-misuse surface than two raw dates.
- **Consequences:** every downstream helper that currently assumes `end == today` needs an
  `anchor_month`-aware branch; this is the single integration point rather than three ad-hoc ones.

### Decision: cash-flow month mode drops forecast/baseline entirely

- **Context:** cash-flow's date range and "change" calculation are structurally tied to `today`
  in multiple places (forecast boundary, current-balance snapshot, baseline projection) — it isn't
  a simple start/end substitution like the other two reports.
- **Decision:** when `anchor_month` is set on `/cash-flow`, ignore the `baseline` param, skip
  forecast-boundary/projection computation entirely, and return only the historical daily actuals
  for that calendar month.
- **Alternatives considered:** still compute a forecast tail from the anchor month's end toward
  `today` — rejected as nonsensical when the anchor month is in the past relative to today (e.g.
  viewing March while today is July) and as extra complexity with no acceptance criterion asking
  for it.
- **Consequences:** cash-flow's month-mode response has `meta.forecast_start_date = null` and
  `meta.baseline_active = false` always; frontend must not show forecast/baseline UI in that mode.

### Decision: reuse existing `change_amount`/`change_percent` fields for "vs. previous month"

- **Context:** `ReportSummary` already carries `change_amount`/`change_percent`, populated today
  by each report with its own (non-"previous calendar month") comparison logic.
- **Decision:** add a shared `_previous_month_change()` helper and call it from all three report
  functions specifically when `anchor_month` is set, replacing their normal comparison logic for
  that mode only. No new response field.
- **Alternatives considered:** a separate `previous_month_comparison` object on the response —
  rejected as unnecessary schema growth when the existing fields already mean "change vs. what the
  report considers the relevant prior point," and mode-specific semantics for the same field is
  consistent with how each report already computes it differently from the others today.
- **Consequences:** frontend rendering of the summary delta chip is mode-agnostic — it already
  just renders whatever `change_amount`/`change_percent` says, so no frontend response-parsing
  change is needed, only the existing dashboard-style delta-chip visual treatment (▲/▼,
  `text-emerald-600`/`text-rose-500`) needs to be added to the reports summary, matching
  `dashboard.tsx` lines 932-954.

### Decision: new `/api/reports/bounds` endpoint for the earliest navigable month

- **Context:** the spec requires capping backward navigation at the workspace's earliest
  transaction month; no such data is exposed to the frontend today, and `MonthStepper` doesn't
  even forward a `minDate` if one were supplied.
- **Decision:** add `GET /api/reports/bounds` returning `{ earliest_month: "YYYY-MM" | null }`,
  extracting the existing earliest-transaction query in `_get_baseline_projection` into a shared
  `get_earliest_transaction_month()` function reused by both call sites.
- **Alternatives considered:** compute it client-side from already-fetched report data — rejected,
  the earliest transaction is workspace-wide and unrelated to whatever window is currently loaded;
  fetching all transactions client-side to find it would be far heavier than one indexed query.
- **Consequences:** one new endpoint + one new React Query hook (`useReportBounds()`); also fixes
  `MonthStepper` to actually respect `minDate`/`maxDate`, which benefits `/transactions` too (bug,
  not scope creep — it's a one-line prop passthrough already-supported by `MonthPicker`).

### Decision: Range/Month is a single segmented toggle; both selections persist independently per tab switch

- **Context:** acceptance criteria require switching Range↔Month to be one obvious action, and
  switching report tabs must not silently lose either the selected preset or the selected month.
- **Decision:** `reports.tsx` holds `mode`, `rangeKey`, and `month` as three independent pieces of
  state (all URL-synced). Tab switches only clamp `rangeKey`/`interval` to the new tab's valid
  option set (existing behavior) — they never reset `mode` or `month`.
- **Alternatives considered:** collapsing month selection into the existing `rangeKey` state (e.g.
  a synthetic range option) — rejected, conflates two different selection kinds and would make the
  "don't lose the other one when switching modes" requirement harder to satisfy cleanly.
- **Consequences:** `reports.tsx` gains its first `useSearchParams` usage, bringing it in line with
  `transactions.tsx`/`dashboard.tsx` (currently the only page with zero URL sync); deep links and
  browser back/forward now affect this page for the first time — covered under Test Strategy.

## Data Model / Contracts

**New/changed query params** (`GET /api/reports/net-worth`, `/income-expenses`, `/cash-flow`):

| Param          | Type          | Notes                                                        |
| -------------- | ------------- | ------------------------------------------------------------- |
| `anchor_month` | `str \| None` | `YYYY-MM`, pattern-validated. When set, overrides `months`/`period`/`days`. |

**New endpoint:**

```
GET /api/reports/bounds
→ 200 { "earliest_month": "2024-03" | null }
```

**No change** to `ReportResponse`/`ReportSummary`/`ReportMeta` shapes — `change_amount`,
`change_percent`, `interval`, `forecast_start_date`, `baseline_active` are all reused as-is, with
mode-dependent values (see ADRs above).

**Frontend API client** (`frontend/src/lib/api.ts`):

```ts
netWorth(months?, interval?, accountIds?, assetGroupIds?, period?, anchorMonth?: string)
incomeExpenses(months?, interval?, accountIds?, period?, days?, anchorMonth?: string)
cashFlow(months?, interval?, baseline?, accountIds?, anchorMonth?: string)
bounds(): Promise<{ earliest_month: string | null }>
```

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Cash-flow's forecast/baseline logic is entangled with `date.today()` in several places; the month-mode branch could regress default (no-`anchor_month`) behavior | Medium | High | Keep the default code path completely untouched — the new branch is purely additive and only triggered when `anchor_month` is present; add regression tests confirming existing rolling-window tests still pass unchanged |
| `reports.tsx` has zero URL-sync today; adding it changes deep-link/back-button behavior for the first time on this page | Low | Medium | Manual QA of tab switching + browser back/forward as part of test strategy |
| No frontend test tooling precedent for component/page-level tests (only pure-logic `*.test.ts` exists) | High | Low | Scope automated frontend tests to pure logic only (e.g. bounds hook, any new `month-utils` helper); treat component-level test tooling as a follow-up, not blocking this feature |
| Earliest-transaction query runs on every `/bounds` call | Low | Low | Reuses the existing indexed `Transaction.date` column and existing query shape; no caching needed at current scale |

## Test Strategy

**Backend** (`backend/tests/test_report_service.py`, `test_report_service_coverage.py`):
- `test_net_worth_api_accepts_anchor_month` — response scoped to exactly that calendar month.
- `test_income_expenses_api_accepts_anchor_month` — same, plus SQL-side interval grouping check.
- `test_cash_flow_api_accepts_anchor_month_disables_forecast` — asserts `meta.forecast_start_date`
  is null and `meta.baseline_active` is false regardless of the `baseline` param.
- `test_*_month_mode_change_vs_previous_month` (one per report) — unit tests for
  `_previous_month_change()` and its integration into each report's summary.
- `test_reports_bounds_endpoint_returns_earliest_month` / `..._no_transactions` (null case).
- Full existing suite re-run unchanged — confirms no regression to rolling-window presets (spec
  acceptance criterion).

**Frontend:**
- `frontend/src/lib/month-utils.test.ts` (new) — only if a new pure helper is introduced; existing
  `shiftMonth`/`monthRange` are reused as-is and already untested, no new coverage required for them
  beyond what this feature exercises.
- Manual QA covering: mode toggle preserves the other mode's selection across tab switches
  (including Money Map); no-data month shows existing empty state; interval forced to daily and
  toggle disabled in month mode (net worth/income-expenses/cash-flow — Money Map has no interval
  toggle either way); `MonthStepper` can't navigate earlier than `/bounds`' `earliest_month` or
  later than the current month; browser back/forward and page reload preserve
  `mode`/`month`/`rangeKey` via URL.

## Out of Scope (deferred)

- Unifying `/dashboard` and `/budgets`' hand-rolled month-stepper UIs onto the shared
  `MonthStepper` component — both currently duplicate the popover/prev-next markup themselves;
  worth a follow-up cleanup but not required by this spec.
- `/budgets`' local, unsynced `currentMonth()` helper and lack of URL sync — pre-existing
  inconsistency, unrelated to this feature.
- Automated component/page-level frontend tests — no tooling precedent exists yet in this repo;
  establishing one (e.g. React Testing Library) is a separate decision, not bundled into this plan.

## Revision History

| Version | Date       | Author | Change       |
| ------- | ---------- | ------ | ------------ |
| 0.1.0   | 2026-07-28 | Victor Alves | Initial plan |
| 0.2.0   | 2026-07-28 | Victor Alves | Approved |
