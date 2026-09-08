# T6 — Separate buy and sell actions, notes field, fee-inclusive totals

| Field      | Value |
| ---------- | ----- |
| Task       | T6    |
| Feature    | 008   |
| Status     | Done  |
| Depends on | T4    |
| PR         |       |
| Jira       |       |

## Description

The task that addresses the spec's originating problem: make recording a sale as reachable and
as obvious as recording a purchase.

## Implementation guidance

From spec decision D3 and `plan.md` → ADR *bought/sold aggregates follow `_recompute`'s fee
convention*.

**Why this exists.** The model has supported both directions since issue #235, and
`AddHoldingTransactionDialog` already has a Type toggle. The problem is discovery: the only
inline affordance is `+ add buys` (`renderHoldingRow` ~line 772), rendered in the average-price
cell **and only when `average_price == null`** — so it disappears for exactly the holdings a
user is most likely to sell. Buy is a link on the table; sell is three interactions deep behind
a control that does not name it.

**Deliver two distinct, separately labelled primary actions** in the drawer — record a purchase
and record a sale — neither requiring the user to change a type control to reach the other.
Both open `AddHoldingTransactionDialog` pre-set to that `kind`. The Type toggle **stays** in the
dialog for editing an existing trade; it is simply no longer the only way to discover that
selling exists.

**Sale unavailable at zero units**, with a stated reason rather than a request failure. This
mirrors the backend rule: `_raise_if_oversell` rejects a sale that exceeds units held, because
the portfolio is buy-and-hold and a position cannot go negative. The existing oversell warning
for an over-large quantity stays as it is (`assets.oversellWarning`).

**Notes** — expose the `notes` field in the dialog. `AssetTransaction.notes` already exists and
`addTransaction` / `updateTransaction` already accept it; the dialog just never showed it.

**One fee convention.** Today the ledger row displays `quantity × price` with no fee while the
dialog's "Total" line adds it — the same word naming two numbers. Adopt the fee-inclusive
figure in both, with the fee shown as a separate secondary line (as the global tab already
does). This changes the displayed total for any trade with a non-zero fee, and that is the
point: the previous number did not match the form that created it.

Mutations go through `refetchAssetLedgerViews` from T3.

## Files affected

- `frontend/src/components/assets/AddHoldingTransactionDialog.tsx`
- `frontend/src/components/assets/AssetDetailDrawer.tsx`
- `frontend/src/locales/*.json` (nine files)

## Done when

Satisfies the spec's *Buy and sell parity* criteria: two separately labelled actions, sale
unavailable with a stated reason at zero units, either action opens the form pre-set to that
direction, the oversell warning still appears, and every surface updates after a save or
delete. Also the *Per-asset trade list* criteria on notes and on total consistency.

## Notes

Watch the interaction with T4's close-on-disappear behavior: selling the whole position from
this control is the fastest way to make the drawer's own asset vanish.

## Outcome

The drawer carries two primary actions — `assets.recordBuy` and `assets.recordSell` — side by
side above the summary. `AddHoldingTransactionDialog` gained an `initialKind` prop, so either
action opens the form already set to that direction; the type toggle stays for changing
direction on an existing trade. The page's dialog state went from `addTxAssetId: string | null`
to `addTx: { id, kind } | null`.

Sale unavailable at zero units, with the reason stated in a line under the buttons — **not as
a `title` tooltip**, which was the first attempt: a `title` on a `disabled` button does not
fire in most browsers, so it would have been dead code standing in for a stated reason.

`notes` is now in the form, reusing the existing `transactions.notes` label rather than adding
a ninth-locale duplicate of the word.

**One fee convention, in a tested function.** `txTotal` first landed in
`components/assets/asset-format.ts`, then moved to `lib/asset-detail-utils.ts` — it is the fee
convention itself, so it belongs beside `boughtSoldTotals` where the tests are. Three tests
cover it, including one asserting `txTotal(one) === boughtSoldTotals([one]).bought`, which is
what keeps a row and the summary above it from disagreeing. Both the drawer's ledger row and
the global tab's row now use it.

Four locale keys added across nine files. Suite 109/109, `tsc` clean, lint unchanged.
