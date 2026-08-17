# T13 — Toggle control, overdue surface and credit-card display

| Field      | Value        |
| ---------- | ------------ |
| Task       | T13          |
| Feature    | 002          |
| Status     | Done         |
| Depends on | T4, T9, T10  |
| PR         |              |
| Jira       | —            |

## Description

The remaining front-end surfaces: the *include planned* control, the indicator that says a figure
includes planned amounts, the overdue-planned entry point, and committed-vs-drawn credit.

## Implementation guidance

**The toggle** — writes `preferences.include_planned` via `PATCH /users/me`. It must be discoverable
from the views whose numbers it changes, not buried in a settings page the user visits once. A
control adjacent to the affected figures is the point: the spec requires that a total is never
ambiguous about what it counts.

**The indicator.** Every view whose figures currently include planned amounts must say so. This is a
separate criterion from the toggle itself — a user landing on a dashboard needs to know why the
number differs from their bank without hunting for a setting.

**The overdue surface.** Consumes `GET /transactions/planned/overdue` from T10: a count badge plus a
list the user can act on. Reachable from the main navigation or the dashboard.

This surface is what makes manual reconciliation (D2) workable. Sync inserts a second row rather than
merging (T7), so a forgotten planned entry double-counts whenever the toggle is on. The spec is
explicit that this surface exists so the user notices that state rather than discovering it as a
strange total. Give the count real prominence — a muted counter defeats the purpose.

**Credit-card display** — `frontend/src/pages/account-detail.tsx`. Show committed credit alongside
drawn credit, consuming `committed_credit` and `planned_amount` from T9. Both numbers stay: drawn
answers "what has the bank charged?", committed answers "what room do I actually have?".

The page duplicates cycle math (`defaultCycleForCreditCard`, `dueDateForCycle`,
`creditCardCycleLabel`, `creditCardCycleBoundaries`, lines 49-150). Planned rows get their bill
assignment from the backend via `apply_effective_date`, so **do not extend the frontend cycle math**
for this feature — read the assignment, do not recompute it.

**Projected-row consistency.** The dashboard already merges real and projected transactions into one
`DisplayRow[]` with an `isProjected` flag (lines 443, 493, 517), renders projected rows with a violet
recurring pill (1130-1134), and makes them non-clickable (1103). Planned rows are *real* rows — they
are clickable and editable. Make sure the two do not become visually indistinguishable while
behaving differently; that is a worse outcome than either treatment alone.

New strings in every locale file under `frontend/src/locales/`.

## Files affected

- `frontend/src/pages/dashboard.tsx`
- `frontend/src/pages/account-detail.tsx`
- `frontend/src/locales/*.json`
- settings/preferences component, wherever the toggle lands

## Done when

Satisfies: *"The toggle's state persists across sessions and is discoverable from the views whose
numbers it changes"*, *"When the toggle is on, every view whose figures include planned amounts
indicates that fact"*, *"Planned transactions whose date has passed … are surfaced as an actionable
overdue planned set with a count, reachable from the main navigation or dashboard"*, and *"the UI
distinguishes credit committed from credit already drawn."*

Verified by: toggling changes dashboard figures and persists across a reload; the indicator appears
only when the toggle is on; the overdue count matches the API and its list is actionable; committed
and drawn credit are both shown and differ when a planned purchase exists; a planned row remains
clickable while a projected row does not.

## Notes

If the toggle's placement turns out to need a real design decision rather than a mechanical
placement, raise it before building — the spec constrains discoverability but not location.

**Outcome.** Toggle, indicator and overdue badge live in one strip directly above the dashboard
figures, not in a settings page — the spec requires discoverability from the views whose numbers
change. The indicator only renders when the toggle is on; the overdue badge only when the count is
non-zero, and it links to `/transactions?status=planned`.

The mutation writes the **whole** preferences object back (spread + override) because the API replaces
the JSON blob wholesale — writing just the one key would drop language and currency. It invalidates
dashboard, budgets, reports and accounts queries, which is the full set of surfaces T4/T5/T9 made
preference-dependent.

`overduePlanned()` added to the API client; `include_planned`, `committed_credit` and `planned_amount`
added to the TS types.

On account detail, committed credit is shown as a sub-line under available credit rather than
replacing it, and only when a planned amount actually exists — no point showing two identical numbers.
The frontend cycle math was **not** extended: planned rows get their bill assignment from the backend.

`tsc -b` clean. Frontend suite green (52 tests). ESLint: 6 warnings across the two pages, identical to
the pre-change baseline — verified by stashing.

**Revision (user request, post-completion).** The toggle moved out of its own strip and into the
`PageHeader` action row, beside the month selector; the hint text became a `?` tooltip matching the
existing `HelpCircle` pattern used by the balance cards. The overdue badge moved with it. The row
wraps, so the controls stack rather than overflow on narrow screens.

**Second revision (user request): the control is replicated, not badged.** Extracted to
`components/include-planned-toggle.tsx` and mounted on the dashboard, budgets and reports headers —
the three views whose figures the preference changes. With three call sites, duplicating the
mutation would have guaranteed drift in the query-invalidation list.

This resolves the spec criterion *"every view whose figures include planned amounts indicates that
fact"* more strongly than a badge would: a user looking at a figure they don't recognise can change
what feeds it from where they are, rather than navigating to the dashboard to find the switch. The
separate "figures include planned" badge and its `dashboard.figuresIncludePlanned` key were therefore
removed from all nine locales — a badge announcing the fact beside a checked box labelled the same
thing is noise.
