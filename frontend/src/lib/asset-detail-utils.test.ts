import { describe, expect, it } from 'vitest'
import {
  boughtSoldTotals,
  txTotal,
  cumulativeCostSeries,
  externalLinksFor,
  hasFilterableTicker,
  isLedgerBacked,
  runningPositions,
  tradePriceSeries,
} from './asset-detail-utils'
import type { Asset, AssetTransaction } from '@/types'

function tx(over: Partial<AssetTransaction> & Pick<AssetTransaction, 'id' | 'kind' | 'quantity' | 'price' | 'date'>): AssetTransaction {
  return {
    asset_id: 'a1',
    fee: 0,
    source: 'manual',
    notes: null,
    asset_name: null,
    ticker: null,
    currency: 'USD',
    logo_url: null,
    ...over,
  }
}

function asset(over: Partial<Asset>): Asset {
  return {
    ticker: null,
    name: 'Thing',
    valuation_method: 'market_price',
    ...over,
  } as Asset
}

describe('runningPositions', () => {
  it('reports units held after each trade across a partial sale', () => {
    // 10 @ 100, then 5 @ 120, then sell 4 → 10, 15, 11.
    const txs = [
      tx({ id: 't1', kind: 'buy', quantity: 10, price: 100, date: '2026-01-10' }),
      tx({ id: 't2', kind: 'buy', quantity: 5, price: 120, date: '2026-02-10' }),
      tx({ id: 't3', kind: 'sell', quantity: 4, price: 150, date: '2026-03-10' }),
    ]
    const pos = runningPositions(txs)
    expect(pos.get('t1')).toBe(10)
    expect(pos.get('t2')).toBe(15)
    expect(pos.get('t3')).toBe(11)
  })

  it('ends at the holding units the backend derived from the same ledger', () => {
    const txs = [
      tx({ id: 't1', kind: 'buy', quantity: 10, price: 100, date: '2026-01-10' }),
      tx({ id: 't2', kind: 'buy', quantity: 5, price: 120, date: '2026-02-10' }),
      tx({ id: 't3', kind: 'sell', quantity: 4, price: 150, date: '2026-03-10' }),
    ]
    // Asset.units as _recompute would cache it: 10 + 5 - 4.
    const unitsFromBackend = 11
    const pos = runningPositions(txs)
    expect(pos.get('t3')).toBe(unitsFromBackend)
  })

  it('replays in date order regardless of the order the API returned', () => {
    // The API serves newest-first; the replay must not depend on that.
    const txs = [
      tx({ id: 't3', kind: 'sell', quantity: 4, price: 150, date: '2026-03-10' }),
      tx({ id: 't2', kind: 'buy', quantity: 5, price: 120, date: '2026-02-10' }),
      tx({ id: 't1', kind: 'buy', quantity: 10, price: 100, date: '2026-01-10' }),
    ]
    const pos = runningPositions(txs)
    expect(pos.get('t1')).toBe(10)
    expect(pos.get('t2')).toBe(15)
    expect(pos.get('t3')).toBe(11)
  })

  it('returns an empty map for an empty ledger', () => {
    expect(runningPositions([]).size).toBe(0)
  })
})

describe('txTotal', () => {
  it('adds the fee to a purchase', () => {
    expect(txTotal(tx({ id: 't', kind: 'buy', quantity: 10, price: 100, fee: 7, date: '2026-01-01' }))).toBe(1007)
  })

  it('subtracts the fee from a sale', () => {
    expect(txTotal(tx({ id: 't', kind: 'sell', quantity: 10, price: 100, fee: 7, date: '2026-01-01' }))).toBe(993)
  })

  it('agrees with boughtSoldTotals on one trade, so the row and the summary match', () => {
    const one = tx({ id: 't', kind: 'buy', quantity: 3, price: 25, fee: 2, date: '2026-01-01' })
    expect(txTotal(one)).toBe(boughtSoldTotals([one]).bought)
  })
})

describe('boughtSoldTotals', () => {
  it('adds the fee to a purchase and subtracts it from a sale', () => {
    // Mirrors _recompute: cost += q*p + fee; realized += (p-avg)*q - fee.
    const txs = [
      tx({ id: 't1', kind: 'buy', quantity: 10, price: 100, fee: 7, date: '2026-01-10' }),
      tx({ id: 't2', kind: 'sell', quantity: 4, price: 150, fee: 3, date: '2026-03-10' }),
    ]
    const totals = boughtSoldTotals(txs)
    expect(totals.bought).toBe(1007) // 10*100 + 7
    expect(totals.sold).toBe(597) //  4*150 - 3
    expect(totals.buyCount).toBe(1)
    expect(totals.sellCount).toBe(1)
  })

  it('treats a missing fee as zero', () => {
    const txs = [tx({ id: 't1', kind: 'buy', quantity: 2, price: 50, date: '2026-01-10' })]
    expect(boughtSoldTotals(txs).bought).toBe(100)
  })

  it('reports zero counts for an empty ledger, so the caller can omit the block', () => {
    expect(boughtSoldTotals([])).toEqual({ bought: 0, sold: 0, buyCount: 0, sellCount: 0 })
  })
})

describe('cumulativeCostSeries', () => {
  const trend = [
    { date: '2026-01-01', amount: 0 },
    { date: '2026-01-31', amount: 1100 },
    { date: '2026-02-28', amount: 1800 },
    { date: '2026-03-31', amount: 1700 },
  ]

  it('accumulates buy cost including fees, and holds flat between trades', () => {
    const txs = [
      tx({ id: 't1', kind: 'buy', quantity: 10, price: 100, fee: 10, date: '2026-01-10' }),
    ]
    const series = cumulativeCostSeries(trend, txs)
    expect(series).toEqual([
      { date: '2026-01-01', cost: 0 }, // trade hasn't happened yet
      { date: '2026-01-31', cost: 1010 }, // 10*100 + 10
      { date: '2026-02-28', cost: 1010 },
      { date: '2026-03-31', cost: 1010 },
    ])
  })

  it('removes the average cost of the units sold, matching _recompute', () => {
    // buy 10 @ 100 (fee 10) → cost 1010, units 10, avg 101
    // buy 5  @ 120          → cost 1610, units 15, avg 107.333…
    // sell 3                → cost 1610 - 3*107.333… = 1288
    const txs = [
      tx({ id: 't1', kind: 'buy', quantity: 10, price: 100, fee: 10, date: '2026-01-10' }),
      tx({ id: 't2', kind: 'buy', quantity: 5, price: 120, date: '2026-02-10' }),
      tx({ id: 't3', kind: 'sell', quantity: 3, price: 150, date: '2026-03-10' }),
    ]
    const series = cumulativeCostSeries(trend, txs)!
    expect(series[1].cost).toBe(1010)
    expect(series[2].cost).toBe(1610)
    expect(series[3].cost).toBeCloseTo(1288, 6)
  })

  it('includes a trade dated exactly on a trend point', () => {
    const txs = [tx({ id: 't1', kind: 'buy', quantity: 1, price: 500, date: '2026-01-31' })]
    const series = cumulativeCostSeries(trend, txs)!
    expect(series[0].cost).toBe(0)
    expect(series[1].cost).toBe(500)
  })

  it('clamps a sale that would take the position negative', () => {
    // Defensive, mirroring _recompute's own clamp; the backend rejects an
    // oversell, so this can only arise from inconsistent data.
    const txs = [
      tx({ id: 't1', kind: 'buy', quantity: 2, price: 100, date: '2026-01-10' }),
      tx({ id: 't2', kind: 'sell', quantity: 5, price: 100, date: '2026-02-10' }),
    ]
    const series = cumulativeCostSeries(trend, txs)!
    expect(series[2].cost).toBe(0)
    expect(series[3].cost).toBe(0)
  })

  it('returns null for an empty ledger so the series is omitted, not flat at zero', () => {
    expect(cumulativeCostSeries(trend, [])).toBeNull()
  })

  it('returns null when there is no trend to align to', () => {
    const txs = [tx({ id: 't1', kind: 'buy', quantity: 1, price: 1, date: '2026-01-10' })]
    expect(cumulativeCostSeries([], txs)).toBeNull()
  })
})

describe('externalLinksFor', () => {
  it('takes a US equity symbol verbatim', () => {
    const links = externalLinksFor(asset({ ticker: 'AAPL', name: 'Apple Inc.' }))
    expect(links.map((l) => l.provider)).toEqual(['yahoo', 'tradingview', 'google'])
    expect(links[0].url).toBe('https://finance.yahoo.com/quote/AAPL')
  })

  it('keeps the .SA suffix for Yahoo and strips it for TradingView', () => {
    const links = externalLinksFor(asset({ ticker: 'PETR4.SA', name: 'Petrobras' }))
    expect(links[0].url).toBe('https://finance.yahoo.com/quote/PETR4.SA')
    expect(links[1].url).toBe('https://www.tradingview.com/symbols/PETR4/')
  })

  it('handles a Brazilian fund/FII ticker', () => {
    const links = externalLinksFor(asset({ ticker: 'HGLG11.SA', name: 'CSHG Logística' }))
    expect(links[0].url).toBe('https://finance.yahoo.com/quote/HGLG11.SA')
    expect(links[1].url).toBe('https://www.tradingview.com/symbols/HGLG11/')
  })

  it('does not mistake a crypto pair suffix for a market suffix', () => {
    const links = externalLinksFor(asset({ ticker: 'BTC-USD', name: 'Bitcoin' }))
    expect(links[0].url).toBe('https://finance.yahoo.com/quote/BTC-USD')
    expect(links[1].url).toBe('https://www.tradingview.com/symbols/BTC-USD/')
  })

  it('encodes the ticker and name into the Google query', () => {
    const links = externalLinksFor(asset({ ticker: 'PETR4.SA', name: 'Petróleo Brasileiro S.A.' }))
    expect(links[2].url).toBe(
      'https://www.google.com/search?q=PETR4.SA%20Petr%C3%B3leo%20Brasileiro%20S.A.',
    )
  })

  it('offers nothing for a Tesouro Direto bond — the symbol is Securo-internal', () => {
    expect(externalLinksFor(asset({ ticker: 'TD:1A2B3C4D:2029-01-01', name: 'Tesouro IPCA+' }))).toEqual([])
  })

  it('offers nothing for a manual or growth-rule asset', () => {
    expect(externalLinksFor(asset({ ticker: 'AAPL', valuation_method: 'manual' }))).toEqual([])
    expect(externalLinksFor(asset({ ticker: 'AAPL', valuation_method: 'growth_rule' }))).toEqual([])
  })

  it('offers nothing for an asset with no ticker', () => {
    expect(externalLinksFor(asset({ ticker: null }))).toEqual([])
    expect(externalLinksFor(asset({ ticker: '   ' }))).toEqual([])
  })
})

describe('tradePriceSeries', () => {
  // FIQE3's real ledger: two trades at 5.61 and one at 5.26, average 5.596619.
  const fiqe3 = [
    tx({ id: 't1', kind: 'buy', quantity: 300, price: 5.61, fee: 0.5, date: '2026-07-21' }),
    tx({ id: 't2', kind: 'buy', quantity: 34, price: 5.61, fee: 0.06, date: '2026-07-21' }),
    tx({ id: 't3', kind: 'buy', quantity: 15, price: 5.26, fee: 0.02, date: '2026-08-06' }),
  ]

  it('orders oldest first, so the chart reads left to right as time', () => {
    const series = tradePriceSeries([...fiqe3].reverse(), 5.596619)
    expect(series.map((p) => p.date)).toEqual(['2026-07-21', '2026-07-21', '2026-08-06'])
  })

  it('measures each trade against the holding average, not against zero', () => {
    const series = tradePriceSeries(fiqe3, 5.596619)
    expect(series[0].deviation).toBeCloseTo(0.013381, 6)
    expect(series[2].deviation).toBeCloseTo(-0.336619, 6)
  })

  it('reports the effective unit price with the fee folded in', () => {
    const series = tradePriceSeries(fiqe3, 5.596619)
    // 15 * 5.26 + 0.02 = 78.92, over 15 units.
    expect(series[2].effectivePrice).toBeCloseTo(78.92 / 15, 10)
    expect(series[2].price).toBe(5.26)
  })

  it('lowers a sale\'s effective price by its fee, matching the fee convention', () => {
    const [sale] = tradePriceSeries(
      [tx({ id: 's', kind: 'sell', quantity: 10, price: 6, fee: 2, date: '2026-09-01' })],
      5.5,
    )
    expect(sale.effectivePrice).toBeCloseTo((10 * 6 - 2) / 10, 10)
  })

  it('does not divide by a zero quantity', () => {
    const [zero] = tradePriceSeries(
      [tx({ id: 'z', kind: 'buy', quantity: 0, price: 4, fee: 1, date: '2026-09-01' })],
      4,
    )
    expect(Number.isFinite(zero.effectivePrice)).toBe(true)
    expect(zero.effectivePrice).toBe(4)
  })

  it('returns nothing for an empty ledger', () => {
    expect(tradePriceSeries([], 5)).toEqual([])
  })
})

describe('isLedgerBacked', () => {
  it('is true for a manual asset that carries trades', () => {
    // The real case this exists for: valuation_method 'manual', three trades,
    // recompute_and_cache having already derived units and average price.
    expect(
      isLedgerBacked(asset({
        valuation_method: 'manual',
        transaction_count: 3,
        average_price: 5.596619,
      })),
    ).toBe(true)
  })

  it('is true for a closed-out ledger with no remaining units', () => {
    expect(isLedgerBacked(asset({ transaction_count: 4, average_price: null }))).toBe(true)
  })

  it('falls back to average_price when the count is absent', () => {
    expect(isLedgerBacked(asset({ transaction_count: 0, average_price: 12.5 }))).toBe(true)
  })

  it('is false for a plain manual asset with no trades', () => {
    expect(
      isLedgerBacked(asset({ valuation_method: 'manual', transaction_count: 0, average_price: null })),
    ).toBe(false)
  })

  it('does not depend on valuation_method', () => {
    // A market-priced asset with no trades yet is not ledger-backed; the drawer
    // shows it the ledger anyway, but on the strength of its valuation method.
    expect(
      isLedgerBacked(asset({ valuation_method: 'market_price', transaction_count: 0, average_price: null })),
    ).toBe(false)
  })
})

describe('hasFilterableTicker vs externalLinksFor', () => {
  it('makes a Tesouro Direto bond filterable but not externally linkable', () => {
    // The spec's explicit criterion: two properties of the same string, and
    // reusing one test for the other would drop TD bonds out of the filter.
    const td = asset({ ticker: 'TD:1A2B3C4D:2029-01-01', name: 'Tesouro IPCA+' })
    expect(hasFilterableTicker(td)).toBe(true)
    expect(externalLinksFor(td)).toEqual([])
  })

  it('is false only when there is no ticker at all', () => {
    expect(hasFilterableTicker(asset({ ticker: null }))).toBe(false)
    expect(hasFilterableTicker(asset({ ticker: 'AAPL' }))).toBe(true)
  })
})
