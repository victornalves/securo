# T17 — Tooltip anchoring by id, and a "% of portfolio" that resolves

| Field      | Value  |
| ---------- | ------ |
| Task       | T17    |
| Feature    | 008    |
| Status     | Done   |
| Depends on | T5, T16 |
| PR         | #13    |
| Jira       |        |

## Description

Two defects found while using the drawer on real data.

## Outcome

### 1. The price chart's tooltip reported the wrong trade

Reported precisely: hovering the 34-unit purchase showed "Compra · 300". Both trades are dated
2026-07-21, and the diagnosis in the report was right — anchoring was by date, not by id.

`XAxis dataKey="date"` makes a **category** axis. Two trades sharing a date share one category
slot, so both bars resolved to the same payload and the tooltip always rendered the first. The
bars themselves drew correctly (positioned by index), which is what made it look like a tooltip
bug rather than an axis bug.

Fixed by keying the category axis on `id`, with tick labels resolved through a `Map<id, date>`.
Two trades on one day still produce two ticks reading the same date, which is honest — they are
two trades.

A regression test pins the invariant the chart depends on: `tradePriceSeries` keeps same-date
trades as separate points with distinct ids and quantities `[300, 34]`. It cannot catch a chart
misconfiguration (there is no DOM in the `node` test environment), but it stops the series itself
from ever collapsing at the source.

### 2. "% of portfolio" showed a dash for every holding

`GET /assets` fills `current_value_primary` **only when the asset's currency differs from the
display currency** (`api/assets.py`) — the backend skips a no-op conversion. So in a
single-currency portfolio the field is `null` on every asset.

The portfolio total already coped, falling back to `current_value`. The per-asset numerator did
not: it required `current_value_primary != null`. Numerator and denominator applied different
rules, so the figure could only ever be a dash for such a portfolio — which is every one of the
live database's 18 assets, all BRL against a BRL display currency.

`valueInDisplayCurrency(asset, displayCurrency)` is now the single rule, used by the page's
total, the holdings-table row and the drawer's summary. It prefers the converted figure, falls
back to `current_value` **only** when the asset is already in the display currency (where the
fallback is exact), and returns `null` otherwise — so a foreign asset with a failed conversion no
longer contributes its unconverted amount to a total. That last part makes the denominator
slightly stricter than before; it was previously summing unconverted amounts, which is a quiet
way to overstate a portfolio.

This defect is pre-existing — the holdings table's `% carteira` column has the same expression
and has never resolved for a single-currency portfolio. Fixing it there follows from using one
helper; leaving the table broken while the drawer worked would have been the odd outcome.

Four tests for the helper. Suite 125/125, `tsc` clean, full build green.
