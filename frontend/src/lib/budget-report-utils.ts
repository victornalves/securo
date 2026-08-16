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
    budgeted: row.budgeted,
    // Strictly greater: spending exactly the envelope is not overspending.
    over: row.realized > row.budgeted,
    coverage:
      row.months_budgeted < row.months_in_window
        ? { budgeted: row.months_budgeted, total: row.months_in_window }
        : null,
  }))

  if (response.summary.out_of_budget > 0) {
    data.push({
      key: OUT_OF_BUDGET_KEY,
      label: outOfBudgetLabel,
      color: OUT_OF_BUDGET_COLOR,
      realized: response.summary.out_of_budget,
      budgeted: null,
      over: false,
      coverage: null,
    })
  }

  return data
}

/** Minimum horizontal room a column needs to keep its label readable. */
export const COLUMN_WIDTH = 84

/** Chart width for `count` columns inside `available` pixels — the chart grows
 *  past its container (which scrolls) rather than squeezing labels away. */
export function chartWidth(count: number, available: number): number {
  return Math.max(available, count * COLUMN_WIDTH)
}
