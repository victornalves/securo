import { describe, expect, it } from 'vitest'
import {
  buildDrillDownItems,
  summarizeDrillDown,
  type DrillDownFilter,
} from './drill-down-utils'
import type { ProjectedTransaction, Transaction } from '@/types'

const USER_CURRENCY = 'BRL'

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    user_id: 'user-1',
    account_id: 'acc-1',
    category_id: 'cat-1',
    category: null,
    external_id: null,
    description: 'Groceries',
    amount: 100,
    currency: USER_CURRENCY,
    date: '2026-09-15',
    type: 'debit',
    source: 'manual',
    status: 'posted',
    payee: null,
    payee_id: null,
    payee_name: null,
    notes: null,
    transfer_pair_id: null,
    amount_primary: null,
    fx_rate_used: null,
    fx_fallback: false,
    installment_number: null,
    total_installments: null,
    installment_total_amount: null,
    installment_purchase_date: null,
    bill_id: null,
    effective_bill_date: null,
    splits: [],
    ...overrides,
  } as Transaction
}

function projection(overrides: Partial<ProjectedTransaction> = {}): ProjectedTransaction {
  return {
    recurring_id: 'rec-1',
    description: 'Netflix',
    amount: 55,
    amount_primary: null,
    currency: USER_CURRENCY,
    type: 'debit',
    date: '2026-09-20',
    category_id: 'cat-1',
    category_name: 'Streaming',
    category_icon: 'tv',
    category_color: '#3B82F6',
    ...overrides,
  }
}

function build(
  transactions: Transaction[],
  projections: ProjectedTransaction[] = [],
  filter: DrillDownFilter | null = null,
) {
  return buildDrillDownItems({ transactions, projections, filter })
}

describe('buildDrillDownItems — classification', () => {
  it('marks a planned row as planned', () => {
    const [item] = build([tx({ status: 'planned' })])
    expect(item.kind).toBe('planned')
  })

  it('marks every other stored status as realized', () => {
    expect(build([tx({ status: 'posted' })])[0].kind).toBe('realized')
    expect(build([tx({ status: 'pending' })])[0].kind).toBe('realized')
  })

  it('marks a recurring occurrence as projected', () => {
    const [item] = build([], [projection()])
    expect(item.kind).toBe('projected')
    expect(item.transaction).toBeNull()
  })
})

describe('summarizeDrillDown — totals', () => {
  it('returns one total covering every kind', () => {
    const items = build(
      [tx({ amount: 100 }), tx({ id: 'tx-2', amount: 200, status: 'planned' })],
      [projection({ amount: 55 })],
    )

    const { absTotal } = summarizeDrillDown(items, USER_CURRENCY)

    // The figure the drawer must match is the whole list, not a subset.
    expect(absTotal).toBe(355)
  })

  it('counts negative amounts by absolute value', () => {
    const items = build([tx({ amount: -100 })])
    expect(summarizeDrillDown(items, USER_CURRENCY).absTotal).toBe(100)
  })

  it('reports the planned portion without counting projections', () => {
    const items = build(
      [tx({ amount: 100 }), tx({ id: 'tx-2', amount: 200, status: 'planned' })],
      [projection({ amount: 55 })],
    )

    const { plannedCount, plannedTotal } = summarizeDrillDown(items, USER_CURRENCY)

    // A projection is not a commitment the user recorded, so the footer line
    // must not claim it is.
    expect(plannedCount).toBe(1)
    expect(plannedTotal).toBe(200)
  })

  it('reports no planned portion when there are none', () => {
    const { plannedCount, plannedTotal } = summarizeDrillDown(
      build([tx()], [projection()]),
      USER_CURRENCY,
    )
    expect(plannedCount).toBe(0)
    expect(plannedTotal).toBe(0)
  })
})

describe('summarizeDrillDown — foreign currency', () => {
  it('uses amount_primary for a foreign-currency row', () => {
    const items = build([tx({ currency: 'USD', amount: 20, amount_primary: 110 })])
    expect(summarizeDrillDown(items, USER_CURRENCY).absTotal).toBe(110)
  })

  it('skips a foreign-currency row that has no primary amount', () => {
    // Adding a raw foreign amount as if it were primary would be worse than
    // omitting it — this mirrors get_summary on the backend.
    const items = build([
      tx({ amount: 100 }),
      tx({ id: 'tx-2', currency: 'USD', amount: 20, amount_primary: null }),
    ])
    expect(summarizeDrillDown(items, USER_CURRENCY).absTotal).toBe(100)
  })

  it('skips an unconvertible planned row from both the total and the count', () => {
    const items = build([
      tx({ id: 'tx-2', currency: 'USD', amount: 20, amount_primary: null, status: 'planned' }),
    ])
    const { absTotal, plannedCount, plannedTotal } = summarizeDrillDown(items, USER_CURRENCY)
    // Count and total must describe the same rows, or the footer line would
    // name a count whose amount is missing from the figure beside it.
    expect(absTotal).toBe(0)
    expect(plannedCount).toBe(0)
    expect(plannedTotal).toBe(0)
  })
})

describe('buildDrillDownItems — planned rows and projections do not collide', () => {
  it('keeps both and counts each once', () => {
    // They are complementary by construction: _get_recurring_projections
    // enumerates from RecurringTransaction.next_occurrence forward, and
    // generate_pending advances past every occurrence it materializes. The
    // invariant lives in recurring_transaction_service.generate_pending — if
    // it ever breaks, this merge will not save us, so do not add a dedupe here.
    const items = build(
      [tx({ description: 'Netflix', amount: 55, date: '2026-09-20', status: 'planned' })],
      [projection({ description: 'Netflix', amount: 55, date: '2026-09-20' })],
    )

    expect(items).toHaveLength(2)
    expect(items.map((i) => i.kind).sort()).toEqual(['planned', 'projected'])
    expect(summarizeDrillDown(items, USER_CURRENCY).absTotal).toBe(110)
  })

  it('gives projections a key that cannot collide with a transaction id', () => {
    const [item] = build([], [projection({ recurring_id: 'rec-9', date: '2026-09-20' })])
    expect(item.key).toBe('proj-rec-9-2026-09-20')
  })
})

describe('buildDrillDownItems — projection filtering', () => {
  it('drops a projection whose type does not match', () => {
    const items = build([], [projection({ type: 'credit' })], {
      title: 'Expenses',
      type: 'debit',
    })
    expect(items).toHaveLength(0)
  })

  it('drops a projection in another category', () => {
    const items = build([], [projection({ category_id: 'cat-other' })], {
      title: 'Groceries',
      category_id: 'cat-1',
    })
    expect(items).toHaveLength(0)
  })

  it('drops a categorized projection from the uncategorized drawer', () => {
    const items = build([], [projection({ category_id: 'cat-1' })], {
      title: 'Uncategorized',
      uncategorized: true,
    })
    expect(items).toHaveLength(0)
  })

  it('keeps an uncategorized projection in the uncategorized drawer', () => {
    const items = build([], [projection({ category_id: null })], {
      title: 'Uncategorized',
      uncategorized: true,
    })
    expect(items).toHaveLength(1)
  })

  it('drops projections outside the date bounds', () => {
    const filter: DrillDownFilter = {
      title: 'September',
      from: '2026-09-01',
      to: '2026-09-30',
    }
    expect(build([], [projection({ date: '2026-08-31' })], filter)).toHaveLength(0)
    expect(build([], [projection({ date: '2026-10-01' })], filter)).toHaveLength(0)
    expect(build([], [projection({ date: '2026-09-30' })], filter)).toHaveLength(1)
  })

  it('never filters stored rows — the backend already did that', () => {
    const items = build([tx({ type: 'credit' })], [], { title: 'Expenses', type: 'debit' })
    expect(items).toHaveLength(1)
  })
})

describe('buildDrillDownItems — ordering', () => {
  it('sorts ascending by date across kinds', () => {
    const items = build(
      [
        tx({ id: 'a', date: '2026-09-20' }),
        tx({ id: 'b', date: '2026-09-05', status: 'planned' }),
      ],
      [projection({ date: '2026-09-10' })],
    )

    expect(items.map((i) => i.date)).toEqual(['2026-09-05', '2026-09-10', '2026-09-20'])
  })
})
