# T10 — Valuation body for manual and growth-rule assets

| Field      | Value |
| ---------- | ----- |
| Task       | T10   |
| Feature    | 008   |
| Status     | Done  |
| Depends on | T4    |
| PR         |       |
| Jira       |       |

## Description

The drawer's second body: valuation history for assets that have no trade ledger, with wording
that stops a revaluation from being read as a purchase or a sale.

## Implementation guidance

From spec decision D2 and `plan.md` → ADR *valuation body states what it records, and rejects
negatives*.

**The confusion being fixed.** `POST /assets/{id}/values` stores an `AssetValue`: an **absolute
revaluation** ("this is worth X as of this date"), not a delta and not a trade. The current
input is `type="number" step="any"` with no `min`, so a negative amount is accepted and makes
the asset worth a negative amount — it does not record a disposal. Users reason "a negative
value must be a sale" and are wrong, correctly, from what the screen shows.

**Deliver:**

- The full (non-`chartOnly`) `AssetDetail` body inside the drawer: the value-evolution chart,
  the revaluation control, and the `AssetValue` history with its per-entry
  change-from-previous figures and the purchase entry it synthesizes today.
- **No purchase or sale action.** The ledger stays off for these assets — see below.
- Wording that names what the control does: recording what the asset is worth on a date,
  distinctly enough that it is not read as recording a purchase. Rename the `assets.addValue`
  string accordingly across all nine locales.
- `min="0"` on the input, and submission blocked for a negative amount with a message saying a
  disposal is not what this control records.

**Preserve exactly:** `growth_rule` assets show history only (the add-value form renders only
for `valuation_method === 'manual' && canWrite`), and per-entry deletion stays restricted to
`v.source === 'manual'` entries.

**Why no ledger here.** `add_transaction` does not check `valuation_method`, so the API would
accept a trade on an apartment — but `recompute_and_cache` then overwrites `units`,
`average_price`, `purchase_price` and `purchase_date` from the replayed ledger and skips
`_apply_price_to_asset` for non-market assets. That collision is a backend question, tracked as
backlog item 009. Do not open it here.

## Files affected

- `frontend/src/components/assets/AssetDetail.tsx`
- `frontend/src/components/assets/AssetDetailDrawer.tsx`
- `frontend/src/locales/*.json` (nine files)

## Done when

Satisfies the spec's *Manual and growth-rule assets* criteria (all five): valuation history
rather than a ledger, no trade actions, a control that names what it records, negative amounts
rejected with the disposal message, `growth_rule` still read-only with sourced entries
undeletable, and the purchase entry plus change-from-previous figures preserved.

## Notes

A user deliberately entering negative valuations (a liability modelled as an asset) loses that.
The correct fix would be a liability type, not a negative asset — out of scope, and worth a
backlog item if it ever comes up.

## Outcome

The manual-asset form is now explicitly a **valuation** form: a heading (`Record a valuation`),
a one-line explanation that it records what the asset is worth on a date and replaces the
previous valuation rather than recording a purchase or a sale, relabelled fields (`Worth on this
date`, `As of`), and `Save valuation` on the button. The history heading became
`Valuation history`.

`min={0}` on the input plus a submit guard: a negative amount is refused with a message that
names the mistake — a valuation cannot be negative, and a disposal is recorded through the
asset's sell date. Silently clamping to zero would have hidden the misunderstanding this whole
task exists to correct.

`growth_rule` assets are untouched: the form still renders only for
`valuation_method === 'manual' && canWrite`, and per-entry deletion stays restricted to
`source === 'manual'` entries. The purchase entry and the change-from-previous figures are
preserved.

Also removed three locale keys that this task orphaned — `assets.addValue`,
`assets.valueHistory` and `assets.amount` — after grepping for dynamic `t()` construction to
confirm nothing built them at runtime. Leaving them would have passed the parity test while
being dead in all nine files.

Seven keys added, three removed, across nine files. `tsc` clean, 109/109.
