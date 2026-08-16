# T13 — Toggle control, overdue surface and credit-card display

| Field      | Value        |
| ---------- | ------------ |
| Task       | T13          |
| Feature    | 002          |
| Status     | Todo         |
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
