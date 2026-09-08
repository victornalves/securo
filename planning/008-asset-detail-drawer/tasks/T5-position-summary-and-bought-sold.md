# T5 — Position summary and bought-vs-sold comparison

| Field      | Value  |
| ---------- | ------ |
| Task       | T5     |
| Feature    | 008    |
| Status     | Todo   |
| Depends on | T2, T4 |
| PR         |        |
| Jira       |        |

## Description

The two summarizing blocks at the top of the ledger body: what the position is right now, and
how much was bought versus sold over its life.

## Implementation guidance

From `plan.md` → *Architecture & Components* (component boundaries) and *Data Model*.

**`PositionSummary`** — presentational only. It takes numbers and renders them; no arithmetic.
Every figure comes straight from the `Asset` payload: `units`, `average_price`, `last_price`
with `last_price_at` for freshness (`formatRelativeTime` already exists in `assets.tsx`),
`current_value`, `gain_loss` plus the percentage the table already derives
(`gain_loss / total_invested * 100`), `realized_gain`, `total_invested`, and share of portfolio
computed from the `portfolioTotalPrimary` prop.

**No client-side cost math.** Spec D5: `_recompute` is the single authority on cost basis,
average price and realized gain. If a figure is not on the payload, it does not go in this
block.

**Two states to handle explicitly:**

- **No recorded cost** (`average_price == null`): show the same "no cost" condition the table
  flags today (the amber `noPriceBadge` / `noPriceWarning` pair) and offer the purchase action
  as the resolution. Do not render a zeroed or empty return.
- **Fully exited** (`sell_date` set, zero units): present the holding as closed, with realized
  gain as the headline figure. The sale action is unavailable (T6 owns the control; this task
  owns the presentation).

**`BoughtSoldBar`** — takes `boughtSoldTotals(txs)` from T2 plus the current market value, and
renders total bought, total sold, and current value of the remaining position as three figures
a user can compare directly, with a short horizontal bar. Omit the whole block for a holding
with no trades — not a row of zeros.

The aggregates are fee-inclusive, matching `_recompute`: a fee raises what a buy cost and
lowers what a sell returned.

## Files affected

- `frontend/src/components/assets/PositionSummary.tsx` (new)
- `frontend/src/components/assets/BoughtSoldBar.tsx` (new)
- `frontend/src/components/assets/AssetDetailDrawer.tsx`

## Done when

Satisfies the spec's *Position summary* criteria (all five) and *Bought vs. sold comparison*
criteria (all three). The "no figure is the result of a client-side cost-basis, average-price,
or realized-gain calculation" criterion is verified by reading the diff: these two components
should contain no `reduce` over prices other than the T2 call.

## Notes

`formatRelativeTime` and the amber no-cost badge markup already exist in `assets.tsx` — reuse
them rather than restating the styling.
