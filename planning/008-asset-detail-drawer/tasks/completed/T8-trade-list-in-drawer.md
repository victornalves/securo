# T8 — Trade list: kind filter, running position, notes, edit

| Field      | Value  |
| ---------- | ------ |
| Task       | T8     |
| Feature    | 008    |
| Status     | Done   |
| Depends on | T2, T4 |
| PR         |        |
| Jira       |        |

## Description

Turn `HoldingLedger` from a bare list of trades into a readable history of the position.

## Implementation guidance

From `plan.md` → ADR *replay the ledger for running position* and the spec's *Per-asset trade
list* criteria.

`HoldingLedger` today lists trades newest-first with a kind badge, date, `quantity × price`,
total, and a delete button. Extend it with:

**Running position column** — from `runningPositions(txs)` (T2): the quantity held **after**
each trade. This is what turns a list of receipts into a history. The most recent row's value
must equal the holding's `units`.

Known limitation to carry in a comment, not to fix here: the backend sorts by
`(date, created_at)` but `AssetTransactionRead` does not expose `created_at`, so the client
sorts by date alone. Same-day trades may show intermediate values in a different order than the
backend computed them. The final position and every monetary figure are unaffected.

**Kind filter** — narrow to purchases only or sales only, with the active filter stating how
many rows it matches. Client-side over the already-fetched per-asset list is correct here (one
asset's trades), unlike T12's global tab where the server filter is required.

**Notes** — display a trade's note in the row when set. The write side is T6.

**Edit action** — the drawer's list gains edit alongside delete. `AssetTransactionsTab` already
has the edit path (`openEdit` → the shared dialog); reuse it rather than writing a second form.
Keep the existing delete confirmation wording about recalculating the average price
(`assets.confirmDeleteTx`).

**Totals** — fee-inclusive, matching T6, so the same word does not name two different numbers
depending on where it appears.

**Empty state** — offer the purchase action, not a bare "no data".

Mutations go through `refetchAssetLedgerViews` from T3.

## Files affected

- `frontend/src/components/assets/HoldingLedger.tsx`
- `frontend/src/locales/*.json` (nine files)

## Done when

Satisfies the spec's *Per-asset trade list* criteria (all seven): newest-first with direction,
date, quantity, unit price, total and fee; running position whose latest value equals `units`;
kind filter with a match count; notes visible; edit and delete with the existing confirmation;
totals consistent with the form; and an empty state that offers the purchase action.

## Notes

The running-position column is the one place a reviewer can check T2's replay against reality:
the top row must equal the `units` figure T5 renders a few lines above it.

## Outcome

`HoldingLedger` now carries direction filter chips with counts, a "position after" line per
row, notes, edit and delete, and two distinct empty states.

Four things decided while implementing:

- **Editing reuses `AddHoldingTransactionDialog`**, extended with an optional `editingTx` prop,
  rather than a second form. The page now holds `{ id, kind, tx? }` and one dialog serves both
  add and edit — which is also what finally gives the in-form type toggle its documented
  purpose: changing a trade's direction after the fact.
- **The client-side oversell guard is skipped when editing**, and that is a bug avoided rather
  than a shortcut. `holding.units` already has an existing sale's quantity subtracted out, so
  comparing an edited quantity against it rejects legitimate edits — raising a sale from 4 to 6
  on a holding now showing 11 units is not an oversell. The global transactions tab already
  skipped the check for the same reason; the server replays the whole ledger and catches a real
  one.
- **A delete confirmation was added**, which the inline ledger never had — it deleted on the
  first click. The wording is the existing `assets.confirmDeleteTx`, about recalculating the
  average price.
- **Running positions are computed over the whole ledger, never the filtered view.** "Units
  held after this trade" is a fact about the position; deriving it from the visible rows would
  make filtering to sells report a nonsense sequence.

One real lint finding fixed rather than suppressed: `const all = txs ?? []` handed a fresh
array reference to three `useMemo` hooks every render, so none of them memoized. Now
`useMemo(() => txs ?? [], [txs])`.

Three locale keys across nine files. `tsc` clean, 109/109, lint back to the two pre-existing
warnings.
