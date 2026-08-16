import { describe, expect, it } from 'vitest'
import {
  buildBudgetChartData,
  chartWidth,
  COLUMN_WIDTH,
  OUT_OF_BUDGET_COLOR,
  OUT_OF_BUDGET_KEY,
  OVER_BUDGET_COLOR,
} from './budget-report-utils'
import type { BudgetReportResponse, BudgetReportRow } from '@/types'

function row(overrides: Partial<BudgetReportRow> = {}): BudgetReportRow {
  return {
    category_id: 'cat-1',
    category_name: 'Groceries',
    category_icon: 'shopping-cart',
    category_color: '#10B981',
    group_name: null,
    budgeted: 1000,
    realized: 400,
    difference: 600,
    percentage_used: 40,
    months_in_window: 1,
    months_budgeted: 1,
    ...overrides,
  }
}

function response(
  rows: BudgetReportRow[],
  outOfBudget = 0,
): BudgetReportResponse {
  const budgeted = rows.reduce((sum, r) => sum + r.budgeted, 0)
  const realized = rows.reduce((sum, r) => sum + r.realized, 0)
  return {
    rows,
    summary: { budgeted, realized, balance: budgeted - realized, out_of_budget: outOfBudget },
    meta: {
      currency: 'BRL',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      months_in_window: 1,
      anchor_month: '2026-08',
    },
  }
}

describe('buildBudgetChartData', () => {
  it('keeps the order the backend returned', () => {
    const data = buildBudgetChartData(
      response([
        row({ category_id: 'a', category_name: 'A', realized: 900 }),
        row({ category_id: 'b', category_name: 'B', realized: 300 }),
        row({ category_id: 'c', category_name: 'C', realized: 100 }),
      ]),
      'Out of budget',
    )

    expect(data.map((d) => d.key)).toEqual(['a', 'b', 'c'])
  })

  it('appends out of budget last even when it is the largest column', () => {
    const data = buildBudgetChartData(
      response([row({ category_id: 'a', realized: 50 })], 9999),
      'Out of budget',
    )

    expect(data).toHaveLength(2)
    expect(data[1].key).toBe(OUT_OF_BUDGET_KEY)
    expect(data[1].label).toBe('Out of budget')
    expect(data[1].color).toBe(OUT_OF_BUDGET_COLOR)
    expect(data[1].budgeted).toBeNull()
    expect(data[1].over).toBe(false)
  })

  it('omits the out-of-budget column when there is nothing outside the budgets', () => {
    const data = buildBudgetChartData(response([row()], 0), 'Out of budget')

    expect(data).toHaveLength(1)
    expect(data[0].key).toBe('cat-1')
  })

  it('does not flag a category that spent exactly its envelope', () => {
    const data = buildBudgetChartData(
      response([row({ budgeted: 500, realized: 500 })]),
      'Out of budget',
    )

    expect(data[0].over).toBe(false)
    expect(data[0].color).toBe('#10B981')
  })

  it('flags a category one cent over its envelope', () => {
    const data = buildBudgetChartData(
      response([row({ budgeted: 500, realized: 500.01 })]),
      'Out of budget',
    )

    expect(data[0].over).toBe(true)
  })

  it('keeps the category colour when the envelope breaks', () => {
    // Colour is identity: an overspent Groceries is still Groceries. The rose
    // rides the part above the envelope, drawn by the bar itself.
    const data = buildBudgetChartData(
      response([row({ category_color: '#10B981', budgeted: 100, realized: 900 })]),
      'Out of budget',
    )

    expect(data[0].color).toBe('#10B981')
    expect(data[0].color).not.toBe(OVER_BUDGET_COLOR)
  })

  it('does not flag a category one cent under its envelope', () => {
    const data = buildBudgetChartData(
      response([row({ budgeted: 500, realized: 499.99 })]),
      'Out of budget',
    )

    expect(data[0].over).toBe(false)
  })

  it('reports coverage only when the envelope covers part of the window', () => {
    const data = buildBudgetChartData(
      response([
        row({ category_id: 'full', months_in_window: 12, months_budgeted: 12 }),
        row({ category_id: 'partial', months_in_window: 12, months_budgeted: 8 }),
      ]),
      'Out of budget',
    )

    expect(data[0].coverage).toBeNull()
    expect(data[1].coverage).toEqual({ budgeted: 8, total: 12 })
  })

  it('returns a single column when nothing is budgeted but money was spent', () => {
    const data = buildBudgetChartData(response([], 250), 'Out of budget')

    expect(data).toHaveLength(1)
    expect(data[0].key).toBe(OUT_OF_BUDGET_KEY)
    expect(data[0].realized).toBe(250)
  })

  it('returns nothing when there is neither a budget nor spending', () => {
    expect(buildBudgetChartData(response([], 0), 'Out of budget')).toEqual([])
  })
})

describe('chartWidth', () => {
  it('fills the container while the columns fit', () => {
    expect(chartWidth(3, 900)).toBe(900)
  })

  it('grows past the container so labels keep their room', () => {
    expect(chartWidth(20, 900)).toBe(20 * COLUMN_WIDTH)
  })
})
