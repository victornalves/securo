# T14 — Select the drawer body by ledger, not by valuation method

| Field      | Value |
| ---------- | ----- |
| Task       | T14   |
| Feature    | 008   |
| Status     | Done  |
| Depends on | T4, T12 |
| PR         | #13   |
| Jira       |       |

## Description

Fix the premise error found in QA: the drawer decided its body from
`valuation_method === 'market_price'`, which hid the trade ledger for every holding in the live
portfolio.

## Implementation guidance

From `spec.md` D14/D15 (v1.1.0) and `plan.md`'s ADR *select the body by `isLedgerBacked`, not by
`valuation_method`* (v1.1.0).

`isLedgerBacked(asset)` = `transaction_count > 0 || average_price != null` — the signal
`asset_service._asset_to_read` already uses and names in a comment. Body composition becomes:

- `showLedger = isLedgerBacked(asset) || valuation_method === 'market_price'`
- `showValuation = valuation_method !== 'market_price'`
- both true → hybrid, gets both bodies plus a line naming which half governs what
- trade actions wherever `showLedger`

`AssetDetail` takes a `hasLedger` prop, since it can no longer infer from `valuationMethod`
whether the trades behind its chart markers are worth fetching.

## Files affected

- `frontend/src/lib/asset-detail-utils.ts` / `.test.ts`
- `frontend/src/components/assets/AssetDetailDrawer.tsx`
- `frontend/src/components/assets/AssetDetail.tsx`
- `frontend/src/pages/assets.tsx`
- `frontend/src/locales/*.json` (nine files)
- `planning/008-asset-detail-drawer/spec.md`, `plan.md`

## Done when

Satisfies the six criteria added under *Manual and growth-rule assets* in spec v1.1.0.

## Outcome

**How it was found:** the drawer opened on FIQE3 and showed only the valuation body, while the
transactions tab listed three trades for the same asset. Querying the database settled it rather
than guessing:

```
name  | ticker | valuation_method | source | units | average_price | purchase_price | txs
FIQE3 | FIQE3  | manual           | manual | 349   | 5.596619      | 1953.22        | 3
```

`purchase_price` is the cost basis of those three trades, so `recompute_and_cache` had already
run — the asset's figures were ledger-derived while the UI insisted it had no ledger. Widening
the query gave the real scale: **all 18 active assets are `manual` with trades, and there are
zero `market_price` assets.** The ledger body would never have appeared for this portfolio at
all, so the feature's central goal was unmet for 100% of the data it was built for.

**A second bug, same root cause.** The global tab's holding selector was built from
`marketHoldings` (`valuation_method === 'market_price' && !sell_date`), so it was **empty**:
"new ticker" was the only option, and taking it would have created a duplicate asset alongside
the existing one. Renamed to `tradableHoldings` and keyed on `isLedgerBacked`. Pre-existing, not
introduced by this spec, but squarely in the way of its stated goal.

**Hybrids get both bodies.** A hybrid has no quote, so treating it as market-priced would report
a current price and an unrealized gain it cannot know; but its current value does come from
`AssetValue`, so dropping the valuation control would leave that value unmaintainable. Both, with
`assets.hybridValuationNote` saying trades set the position and valuations set the value —
without it the two blocks read as contradicting each other.

Five tests added for `isLedgerBacked`, one of them modelled directly on FIQE3's row. Suite
114/114, `tsc` clean, full build green, lint unchanged.

## Notes

Backlog item 009 is unaffected: it still governs whether a *tradeless* manual asset may start a
ledger. This task only stops the UI from hiding ledgers that already exist.
