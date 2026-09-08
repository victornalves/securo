# T11 — `?asset=<id>` URL addressability

| Field      | Value |
| ---------- | ----- |
| Task       | T11   |
| Feature    | 008   |
| Status     | Todo  |
| Depends on | T4    |
| PR         |       |
| Jira       |       |

## Description

Make the drawer survive a reload and respond to the back button, without stacking a history
entry for every holding the user glances at.

## Implementation guidance

From spec decision D13 and `plan.md` → ADRs *`?asset=<id>` with the reports.tsx push-vs-replace
discipline* and *resolve the URL parameter against the collection-filtered list*.

**Follow `pages/reports.tsx` (~lines 200-250) — it already solved this and documented the
bug.** The discipline:

- the first sync from state to URL uses `setSearchParams(params, { replace: true })`
- subsequent user-driven changes push
- a `didMountRef` distinguishes the two, and a `syncingFromUrlRef` guard keeps the URL→state
  and state→URL effects from fighting
- **`setSearchParams` is excluded from the effect's dependency array on purpose**:
  react-router-dom hands back a new reference on every navigation, and reacting to that alone —
  with no actual state change — pushed a spurious duplicate history entry on every update.
  Reports carries an `eslint-disable-next-line react-hooks/exhaustive-deps` with that
  explanation; do the same rather than "fixing" the dep array.

**History semantics:** opening a drawer from a closed state **pushes** one entry; switching
directly from one asset to another **replaces**; closing pops back to the plain holdings view
and not off `/assets`.

**Resolution** — look the id up in the already-filtered `assetsList`, which is
`assets.list(false)` (archived excluded) narrowed by the collection filter's `activeWalletIds`.
A miss clears the parameter and renders the plain view: no error state, no empty drawer, no
fetch-by-id. Fetching a missing asset by id would open a drawer for something the collection
filter deliberately hid, making the filter leak.

**Cold load** — while `['assets']` is loading the parameter cannot resolve yet. Gate on
`isLoading` rather than clearing the parameter, or a deep link on a cold load is silently
dropped.

**Composition** — the parameter must not reset the active tab, wallet collapse state
(`collapsedWallets`), or the collection filter. This is why a route (`/assets/:id`) was
rejected: a route change remounts the page and resets all three.

## Files affected

- `frontend/src/pages/assets.tsx`

## Done when

Satisfies the spec's *URL addressability* criteria (all five): opening puts the asset in the
URL and reloading reopens the drawer; back closes the drawer and stays on `/assets`; a
nonexistent, invisible or archived asset resolves to the plain view with no error; switching
assets does not make back walk through every holding viewed; and the parameter composes with
tab, collapse state and collection filter.

## Notes

Test the cold-load path deliberately — it is the one that a `useState`-only implementation
appears to pass and actually fails.
