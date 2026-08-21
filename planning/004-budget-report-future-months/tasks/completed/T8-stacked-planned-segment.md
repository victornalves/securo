# T8 — The planned segment, and the overspend cap across it

| Field      | Value |
| ---------- | ----- |
| Task       | T8    |
| Feature    | 004   |
| Status     | Done  |
| Depends on | T7    |
| PR         |       |
| Jira       | —     |

## Description

Turn the execution column into a two-segment stack — realized then planned — without losing
category identity or the rose overspend cap.

## Implementation guidance

`frontend/src/components/reports/BudgetReport.tsx` today draws two grouped bars: `realized`
with the custom `RealizedBar` shape (which paints the rose cap) and `budgeted` as the neutral
track. Change to:

```tsx
<Bar dataKey="realized" stackId="execution" maxBarSize={BAR_SIZE} shape={<RealizedBar />} />
<Bar dataKey="planned"  stackId="execution" maxBarSize={BAR_SIZE} shape={<PlannedBar />} />
<Bar dataKey="budgeted" ... />   {/* unchanged, stays a separate group */}
```

**Planned keeps the hue, adds texture** (004 plan ADR — hue is the category-identity channel and
cannot be spent on state). Emit one `<pattern>` per *distinct* category colour inside `<defs>`,
id derived from the hex (e.g. `budgetPlanned-6366F1`), each a diagonal-line pattern over the
colour at reduced opacity, mirroring how `budgetOutOfBudgetHatch` is built. Dedupe the colours
before rendering so 20 categories do not emit 20 identical defs.

**The cap has to survive the segment boundary.** Neither segment can compute it from its own
value alone, so move the maths out of `RealizedBar` into a shared helper:

```ts
/** Height in px of the part of `segmentValue` that sits above the envelope. */
function capHeight(datum, segmentValue: number, height: number): number {
  if (segmentValue <= 0 || !datum.over || !datum.budgeted) return 0
  const excess = datum.committed - datum.budgeted
  return Math.min(excess, segmentValue) * (height / segmentValue)
}
```

- realized segment: `excess >= realized` → the whole segment is above the envelope; otherwise a
  cap of `capHeight` on its top pixels, solid rose, with the existing `SURFACE_GAP` separation.
- planned segment: same, but the capped part keeps the pattern so texture still says "planned"
  — a rose-tinted pattern rather than solid rose.
- guard zero-height and zero-value segments with an early `return null`, as `RealizedBar`
  already does — the division above is why.

Note stacking changes what recharts passes each shape: `y`/`height` are the segment's, not the
column's, which is exactly what the helper needs.

**Legend and tooltip:** add a planned key to the legend (patterned swatch), and rows for
planned and committed to the tooltip. The tooltip's local `difference` and `percentage` must
move to `datum.committed`; keep the coverage line and its `months`/`total` interpolation note.
The out-of-budget column shows planned too, and keeps its hatch.

Privacy mode already routes every value through `money()`/`mask()` — the new rows must use the
same path.

## Files affected

- `frontend/src/components/reports/BudgetReport.tsx`

## Done when

Satisfies the chart criteria in **Realized and planned as two quantities**: the stacked column,
the hue-preserving planned segment, the cap on the part above the envelope, the tooltip rows,
and the out-of-budget split — legible with 20+ categories and masked under privacy mode.

Verified by: manual QA against a workspace with a category over budget by realized alone, one
over by planned alone, one over by the combination, and one with no spending at all.

## Notes

**Outcome.** `RealizedBar` became `ExecutionSegment`, one component rendering either segment —
the two differ only in fill, rounding and how much of the overshoot they carry, so two near-copies
would have been the wrong shape. `capHeight` lives in `budget-report-utils.ts` (pure, tested: 6
cases including the spill from the planned segment into the realized one) rather than in the
component.

The planned fill is one `<pattern>` per *distinct* colour in `plannedColors`, plus a single rose
`budgetPlannedOver` for capped commitments. The legend's planned swatch is a CSS
`repeating-linear-gradient` matched to the SVG stripe by hand — there is no way to reference an
SVG pattern from an HTML element.

Tooltip rows for planned and committed appear only when `planned > 0`, so a past month's tooltip
reads exactly as it did before.
