# T16 — Per-trade unit-price comparison chart

| Field      | Value |
| ---------- | ----- |
| Task       | T16   |
| Feature    | 008   |
| Status     | Done  |
| Depends on | T2, T5 |
| PR         | #13   |
| Jira       |       |

## Description

Chart the unit price of each trade so the prices practiced over the holding's life can be
compared visually, rather than read off a column of numbers.

## Implementation guidance

From `spec.md` v1.2.0 (*Price comparison across trades*) and `plan.md` v1.2.0's ADR *the
price-comparison chart baselines on the average, not on zero*.

`tradePriceSeries(txs, averagePrice)` in `lib/asset-detail-utils.ts` returns, oldest first:
`{ id, date, kind, quantity, price, effectivePrice, deviation }`. `effectivePrice` is
`txTotal(tx) / quantity` — what the unit really cost once the fee is counted. `deviation` is
`price − averagePrice`; `averagePrice` comes from the API and is never derived here.

`TradePriceChart.tsx` renders a Recharts `BarChart` of `deviation`, one `Cell` per trade coloured
by direction, with a dashed `ReferenceLine` at 0 and a header line naming the baseline's actual
value in currency.

## Files affected

- `frontend/src/lib/asset-detail-utils.ts` / `.test.ts`
- `frontend/src/components/assets/TradePriceChart.tsx` (new)
- `frontend/src/components/assets/AssetDetailDrawer.tsx`
- `frontend/src/locales/*.json` (nine files)
- `planning/008-asset-detail-drawer/spec.md`, `plan.md`

## Done when

Satisfies the seven criteria under *Price comparison across trades* in spec v1.2.0.

## Outcome

**The baseline is the substance of this task.** A bar chart of absolute unit prices rising from
zero was checked against the live ledger before being built: FIQE3's trades at 5.61, 5.61 and
5.26 against an average of 5.5966 give three bars whose heights differ by ~6% on an axis running
to 5.61 — indistinguishable. The literal request would have shipped a chart that answers nothing.

Baselining on the average fixes it without the usual sin of a truncated bar axis: a bar's length
encodes its value, so cutting the axis at 5.2 would make 5.26 look half of 5.61. Measured from
the average, the length encodes the *deviation*, which is exactly what it is drawn from — so
nothing is exaggerated. The trade-off is that the Y axis reads in deviations, which is why the
baseline's value is always printed in the header; an unlabelled baseline would be read as zero
and every figure misread.

For FIQE3 the result is `+0.01 / +0.01 / −0.34`: two purchases essentially at cost and one clearly
below it. A near-invisible bar is itself information — it says "at my average".

Worth knowing about the encoding: since the average is derived from these very trades, most bars
sit near the baseline by construction. The chart is therefore an outlier detector more than a
trend line, which is the useful reading for "am I buying this well?".

Six tests, written against FIQE3's actual ledger rather than invented numbers, including the
fee-inclusive effective price for both directions and a zero-quantity guard (the backend rejects
it, but it would produce `Infinity` if it ever arrived). Suite 120/120.

## Notes

Independent of the ledger's direction filter: the average line describes every trade, and
filtering to buys would leave it describing marks no longer on screen.
