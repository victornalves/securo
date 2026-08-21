import type { BudgetReportResponse } from '@/types'

/** Key of the synthetic column that aggregates spending outside every budget. */
export const OUT_OF_BUDGET_KEY = 'out_of_budget'

/** Neutral tone for the out-of-budget column — it is not a category, so it
 *  borrows no category colour. */
export const OUT_OF_BUDGET_COLOR = '#9CA3AF'

/** Colour for a realized bar that broke its envelope, matching the overspend
 *  rose used elsewhere on the reports screen. */
export const OVER_BUDGET_COLOR = '#F43F5E'

export interface BudgetChartDatum {
  /** Category id, or `OUT_OF_BUDGET_KEY` for the trailing column. */
  key: string
  label: string
  /** Always the category's own colour — identity, never state. Overspend is
   *  drawn as a rose cap on the part above the envelope, so the category stays
   *  recognizable instead of every broken budget looking alike. */
  color: string
  realized: number
  /** Recorded commitments that have not happened yet. Stacked on top of
   *  `realized`, so a future month reads as commitments against the envelope
   *  and the current month keeps the two apart. */
  planned: number
  /** realized + planned — the basis for `over` and the tooltip's committed row.
   *  An envelope with room left only while its commitments are ignored has no
   *  room left. */
  committed: number
  /** `null` on the out-of-budget column, which has no envelope to draw. */
  budgeted: number | null
  over: boolean
  /** Set only when the envelope covers part of the window, so the tooltip can
   *  say so — partial coverage otherwise reads as a blowout. */
  coverage: { budgeted: number; total: number } | null
}

/**
 * Build the chart rows: one per budgeted category, in the order the backend
 * returned them (already sorted by realized desc), plus the out-of-budget
 * column last whenever there is anything to put in it.
 */
export function buildBudgetChartData(
  response: BudgetReportResponse,
  outOfBudgetLabel: string,
): BudgetChartDatum[] {
  const data: BudgetChartDatum[] = response.rows.map((row) => ({
    key: row.category_id,
    label: row.category_name,
    color: row.category_color,
    realized: row.realized,
    planned: row.planned,
    committed: row.realized + row.planned,
    budgeted: row.budgeted,
    // Strictly greater: committing exactly the envelope is not overspending.
    over: row.realized + row.planned > row.budgeted,
    coverage:
      row.months_budgeted < row.months_in_window
        ? { budgeted: row.months_budgeted, total: row.months_in_window }
        : null,
  }))

  const outOfBudget = response.summary.out_of_budget
  const outOfBudgetPlanned = response.summary.out_of_budget_planned
  if (outOfBudget + outOfBudgetPlanned > 0) {
    data.push({
      key: OUT_OF_BUDGET_KEY,
      label: outOfBudgetLabel,
      color: OUT_OF_BUDGET_COLOR,
      realized: outOfBudget,
      planned: outOfBudgetPlanned,
      committed: outOfBudget + outOfBudgetPlanned,
      budgeted: null,
      over: false,
      coverage: null,
    })
  }

  return data
}

/**
 * Height in pixels of the part of one stacked segment that sits above the
 * envelope.
 *
 * Neither segment can work this out from its own value: the envelope is
 * crossed by the *stack*, so whether a segment is above it depends on what
 * sits below. `excess` is the whole overshoot, and each segment paints at most
 * its own share of it — the realized segment (drawn first, at the bottom) only
 * once the overshoot is deeper than the planned segment above it.
 */
export function capHeight(
  datum: Pick<BudgetChartDatum, 'over' | 'budgeted' | 'committed'>,
  segmentValue: number,
  segmentHeight: number,
  /** Total of the segments stacked above this one. */
  above = 0,
): number {
  if (!datum.over || !datum.budgeted || segmentValue <= 0 || segmentHeight <= 0) return 0
  const excess = datum.committed - datum.budgeted
  const share = Math.min(Math.max(excess - above, 0), segmentValue)
  return share * (segmentHeight / segmentValue)
}

/** Minimum horizontal room a column needs to keep its label readable. */
export const COLUMN_WIDTH = 84

/** Chart width for `count` columns inside `available` pixels — the chart grows
 *  past its container (which scrolls) rather than squeezing labels away. */
export function chartWidth(count: number, available: number): number {
  return Math.max(available, count * COLUMN_WIDTH)
}
