# T12 — Transaction list surfaces

| Field      | Value    |
| ---------- | -------- |
| Task       | T12      |
| Feature    | 002      |
| Status     | Done     |
| Depends on | T10, T11 |
| PR         |          |
| Jira       | —        |

## Description

Make planned transactions visually distinct in the list, filterable, and promotable in one action.

## Implementation guidance

**Status column becomes visible by default.**
`frontend/src/components/transactions-grid-columns.tsx:44` currently reads
`defaultVisible: false` — the user must opt in through the column picker. Flip it to `true`.

**Render it as a badge, not grey text.** `frontend/src/pages/transactions.tsx:1122-1129` currently
renders a plain muted `TableCell`. The row already has a badge vocabulary — shared-split, recurring
(violet pill, lines 970-975), ignored with an eye-closed icon, attachment paperclip — and status is
conspicuously the weakest signal among them despite now being the most consequential. Match the
existing badge treatment.

Reuse the visual language already established for projected rows on the dashboard
(`frontend/src/pages/dashboard.tsx:1130-1134`) so planned and projected read as the same family of
"not yet real" rather than two unrelated inventions.

**Status filter** — `frontend/src/components/transactions-filter-bar.tsx`, wired to the repeatable
`?status=` parameter from T10.

**Promote action** — a single action on a planned row that sets `status` to `posted` via the T2
update path. It must preserve category, notes, tags, attachments, splits and instalment metadata,
which it does by going through the ordinary update endpoint.

**The D3 guard applies here too.** Nothing on this screen may read the `include_planned` preference.
Planned rows are always listed; visibility is controlled by the filter alone. Turning the toggle off
must not remove a row from this list, and turning it on must not add one.

New strings in every locale file under `frontend/src/locales/`.

## Files affected

- `frontend/src/components/transactions-grid-columns.tsx`
- `frontend/src/components/transactions-filter-bar.tsx`
- `frontend/src/pages/transactions.tsx`
- `frontend/src/locales/*.json`

## Done when

Satisfies: *"Planned transactions are visually distinct from realized ones in every list where both
appear"*, *"The transactions list can be filtered by state"*, *"The transaction state column is
discoverable by default"*, and the promotion criterion from T2 at the UI level.

Verified by: the status column is visible without touching the column picker; a planned row is
distinguishable at a glance; the filter round-trips to the API; promoting a planned row preserves
every listed field; list contents are identical with the toggle on and off.

## Notes

Consider whether the ignored badge and the planned badge can collide on one row, and what that should
look like. `is_ignored` and `status` are orthogonal axes, so the combination is reachable.

**Outcome.** Status column flipped to `defaultVisible: true` (width 100→110 to fit the badge). The
cell now renders planned as a violet pill and pending as amber, keeping posted as plain muted text —
posted is the unremarkable case and shouldn't compete for attention. Violet deliberately matches the
dashboard's existing projected-row pill so "not yet real" reads as one family.

A row-level planned badge sits alongside the recurring/ignored/instalment badges, so a planned row is
still identifiable when the user hides the status column.

Promotion is exposed as a bulk-bar action, shown only when **every** selected row is planned — a mixed
selection would silently no-op on the rest. It reuses the ordinary update endpoint (`status: 'posted'`);
there is no bulk-status route and adding one wasn't warranted.

The status filter mirrors the existing type submenu so the two read as siblings. It is wired to page
state, the URL (`?status=`), and the list query only — **not** to export or the agent-context filters,
neither of which has a status parameter on the backend. `status?: string | string[]` added to the API
client's list params.

`tsc -b` clean. Frontend suite green (52 tests). ESLint: 3 warnings in `transaction-dialog.tsx`,
identical to the pre-change baseline — verified by stashing.
