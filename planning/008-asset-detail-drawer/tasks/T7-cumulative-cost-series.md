# T7 — Cumulative-cost series on the value chart

| Field      | Value  |
| ---------- | ------ |
| Task       | T7     |
| Feature    | 008    |
| Status     | Todo   |
| Depends on | T2, T4 |
| PR         |        |
| Jira       |        |

## Description

Add a second series to the existing value-evolution chart so the gap between market value and
cumulative cost reads as the unrealized gain.

## Implementation guidance

From spec decision D4 and `plan.md` → ADR *cumulative cost as a second series on the existing
chart*.

The chart lives in `AssetDetail` (`chartOnly` mode) and already does most of the work: it
merges `['asset-trend', assetId]` with `['asset-transactions', assetId]` to place buy/sell
markers via `renderAssetTradeDot`, and its tooltip already names each trade's direction,
quantity and price. Keep all of that.

Add the series from `cumulativeCostSeries(trend, txs)` (T2). It returns `null` for an empty
ledger — render no cost series in that case, rather than a line flat at zero.

Requirements:

- both series labelled and distinguishable
- readable in light and dark themes (the chart uses `var(--border)`,
  `var(--card)`, `var(--muted-foreground)` tokens — stay with them)
- the chart is omitted entirely when the value series has fewer than two points, as
  `chartOnly` already does, and its absence leaves no gap or empty frame in the drawer

The average-cost subtraction inside `cumulativeCostSeries` was settled at plan approval
(plan v1.0.0) and stands. The cumulative-net-cash alternative remains recorded in the ADR but
is not the chosen path — do not switch to it without revising the plan.

## Files affected

- `frontend/src/components/assets/AssetDetail.tsx`
- `frontend/src/locales/*.json` (nine files — series labels)

## Done when

Satisfies the spec's *Chart* criteria (all five): market value with trade markers and the
existing tooltip, a cumulative-cost second series whose distance from the first is the
unrealized gain, both labelled and distinguishable, both themes readable, omitted below two
points, and the cost series absent rather than flat at zero for a tradeless holding.

## Notes

The chart's existing gradient `id` is interpolated per asset (`gradient-${assetId}`) — a second
series needs the same treatment or two drawers in one session will share a gradient.
