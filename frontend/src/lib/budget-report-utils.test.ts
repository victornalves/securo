import { describe, expect, it } from 'vitest'
import {
  buildBudgetChartData,
  capHeight,
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
    planned: 0,
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
  outOfBudgetPlanned = 0,
): BudgetReportResponse {
  const budgeted = rows.reduce((sum, r) => sum + r.budgeted, 0)
  const realized = rows.reduce((sum, r) => sum + r.realized, 0)
  const planned = rows.reduce((sum, r) => sum + r.planned, 0)
  return {
    rows,
    summary: {
      budgeted,
      realized,
      planned,
      balance: budgeted - realized,
      committed_balance: budgeted - realized - planned,
      out_of_budget: outOfBudget,
      out_of_budget_planned: outOfBudgetPlanned,
    },
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

  it('sums realized and planned into the committed total', () => {
    const data = buildBudgetChartData(
      response([row({ budgeted: 1000, realized: 400, planned: 250 })]),
      'Out of budget',
    )

    expect(data[0].committed).toBe(650)
    expect(data[0].over).toBe(false)
  })

  it('flags a category pushed over its envelope by commitments alone', () => {
    // The point of the split: 400 spent is inside a 1000 envelope, but 400
    // spent plus 700 committed is not.
    const data = buildBudgetChartData(
      response([row({ budgeted: 1000, realized: 400, planned: 700 })]),
      'Out of budget',
    )

    expect(data[0].over).toBe(true)
    expect(data[0].color).toBe('#10B981')
  })

  it('does not flag a category committed to exactly its envelope', () => {
    const data = buildBudgetChartData(
      response([row({ budgeted: 1000, realized: 400, planned: 600 })]),
      'Out of budget',
    )

    expect(data[0].over).toBe(false)
  })

  it('flags a future month where everything is planned', () => {
    const data = buildBudgetChartData(
      response([row({ budgeted: 500, realized: 0, planned: 800 })]),
      'Out of budget',
    )

    expect(data[0].over).toBe(true)
    expect(data[0].realized).toBe(0)
    expect(data[0].planned).toBe(800)
  })

  it('shows the out-of-budget column when only its planned half is non-zero', () => {
    const data = buildBudgetChartData(
      response([row()], 0, 320),
      'Out of budget',
    )

    expect(data).toHaveLength(2)
    expect(data[1].key).toBe(OUT_OF_BUDGET_KEY)
    expect(data[1].realized).toBe(0)
    expect(data[1].planned).toBe(320)
    expect(data[1].committed).toBe(320)
  })

  it('splits the out-of-budget column into its two halves', () => {
    const data = buildBudgetChartData(response([row()], 60, 90), 'Out of budget')

    expect(data[1].realized).toBe(60)
    expect(data[1].planned).toBe(90)
    expect(data[1].committed).toBe(150)
  })
})

describe('capHeight', () => {
  // One pixel per currency unit throughout, so the numbers read as amounts.
  const px = (value: number) => value

  it('is zero for a column inside its envelope', () => {
    const datum = { over: false, budgeted: 1000, committed: 650 }
    expect(capHeight(datum, 400, px(400))).toBe(0)
    expect(capHeight(datum, 250, px(250))).toBe(0)
  })

  it('caps only the overshoot when realized alone broke the envelope', () => {
    // 1200 spent against 1000, nothing committed: 200 above the line.
    const datum = { over: true, budgeted: 1000, committed: 1200 }
    expect(capHeight(datum, 1200, px(1200), 0)).toBe(200)
  })

  it('puts the whole overshoot in the planned segment when it fits there', () => {
    // 400 spent + 700 committed against 1000: 100 over, all of it planned.
    const datum = { over: true, budgeted: 1000, committed: 1100 }
    expect(capHeight(datum, 700, px(700), 0)).toBe(100)
    // The realized segment sits entirely below the line.
    expect(capHeight(datum, 400, px(400), 700)).toBe(0)
  })

  it('spills into the realized segment when the overshoot runs deeper than planned', () => {
    // 900 spent + 300 committed against 1000: 200 over — the planned segment
    // holds 300, so all 200 of it lands there and realized stays clean.
    const shallow = { over: true, budgeted: 1000, committed: 1200 }
    expect(capHeight(shallow, 300, px(300), 0)).toBe(200)
    expect(capHeight(shallow, 900, px(900), 300)).toBe(0)

    // 900 spent + 300 committed against 500: 700 over. Planned takes its whole
    // 300, and the remaining 400 caps the top of realized.
    const deep = { over: true, budgeted: 500, committed: 1200 }
    expect(capHeight(deep, 300, px(300), 0)).toBe(300)
    expect(capHeight(deep, 900, px(900), 300)).toBe(400)
  })

  it('scales the cap to the segment height, not to the amount', () => {
    // 100 over out of a 200-unit segment drawn 50px tall → a quarter of it.
    const datum = { over: true, budgeted: 100, committed: 200 }
    expect(capHeight(datum, 200, 50, 0)).toBe(25)
  })

  it('returns zero for an empty segment or a column with no envelope', () => {
    expect(capHeight({ over: true, budgeted: 100, committed: 500 }, 0, 0)).toBe(0)
    expect(capHeight({ over: true, budgeted: null, committed: 500 }, 500, 500)).toBe(0)
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
