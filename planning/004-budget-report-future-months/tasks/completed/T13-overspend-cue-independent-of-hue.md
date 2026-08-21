# T13 — An overspend cue no category colour can imitate

| Field      | Value  |
| ---------- | ------ |
| Task       | T13    |
| Feature    | 004    |
| Status     | Done   |
| Depends on | T8     |
| PR         |        |
| Jira       | —      |

## Description

Make "this category is over budget" readable on a category whose own colour is already rose.

## Implementation guidance

Found in manual QA of the September 2026 chart. The planned segment keeps the category's hue by
design (T8) — hue is identity — but *Saúde* and *Educação* are themselves rose, so their planned
stripes read as the overspend cap from across the room. The cap and a plain segment then differ
only by the surface gap, which at a glance looks like a rendering seam.

Two cues, neither of which any category colour can produce:

1. **The envelope level, drawn.** Inside the existing `SURFACE_GAP`, a 1.25px `NEUTRAL` rule
   spanning the column at the crossing point. The cap stops being "a differently-coloured top"
   and becomes "the part above a line". Drawn only when the segment has something below the
   crossing (`withinHeight > 0`), which is what keeps it to exactly one line per column even
   when the overshoot spills from the planned segment into the realized one.
2. **The axis label turns rose** (and semibold) for an over-budget category. `CategoryTick` takes
   the chart rows and matches on the label, so the cue sits *outside* the bar entirely.

Spec 003's criterion asked for "colour and/or badge, not only the relative bar heights" — this is
the badge half, which the rose cap alone did not deliver for rose categories.

## Files affected

- `frontend/src/components/reports/BudgetReport.tsx`

## Done when

An over-budget category is identifiable at a glance regardless of its own colour.

Verified by: the September 2026 chart, where *Moradia* (violet, 102% committed) and *Saúde* (rose,
82% committed) must read as different states.

## Notes

Scope drift from the plan's *"overspend is a rose cap"* ADR, which assumed the cap alone carried
the signal. The plan's ADR was amended rather than left to imply a cue that does not survive a
rose category. No backend change, no schema change.
