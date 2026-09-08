import type { Asset, AssetTransaction } from '@/types'

/**
 * Pure logic behind the asset detail drawer.
 *
 * Lives outside the components so it can be tested: the drawer's job is to
 * explain a holding, and the questions that matter — how many units did I hold
 * after this trade, how much did I put in versus take out, where does the
 * market value sit relative to what it cost — are arithmetic, not rendering.
 *
 * What is deliberately NOT here: cost basis, average price and realized gain.
 * `asset_transaction_service._recompute` is the single authority on those
 * (weighted-average cost, fees added to cost on a buy and subtracted from
 * realized gain on a sell), and a second implementation in TypeScript would
 * drift from it silently. Everything below is a sum over stored fields or a
 * string concatenation. See planning/008-asset-detail-drawer.
 */

/** Yahoo-style market suffix, e.g. the `.SA` in `PETR4.SA`. */
const MARKET_SUFFIX = /\.[A-Z]{2,4}$/

/** Prefix of the synthetic Tesouro Direto symbol, `TD:<hash>:<maturity>`. */
const TESOURO_PREFIX = 'TD:'

function sortByDate(txs: AssetTransaction[]): AssetTransaction[] {
  return [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Units held after each trade, keyed by transaction id.
 *
 * The backend replays the ledger sorted by `(date, created_at)`, but
 * `AssetTransactionRead` does not expose `created_at` — so this can only sort
 * by date. For several trades on the same date the intermediate values may
 * therefore appear in a different order than the backend computed them. The
 * final position is unaffected (addition commutes) and no monetary figure
 * depends on this ordering. If the intermediate order ever matters, the fix is
 * a `created_at` field on the API response, not a guess here.
 */
export function runningPositions(txs: AssetTransaction[]): Map<string, number> {
  const result = new Map<string, number>()
  let units = 0
  for (const tx of sortByDate(txs)) {
    units += tx.kind === 'buy' ? tx.quantity : -tx.quantity
    result.set(tx.id, units)
  }
  return result
}

/**
 * What went in and what came out over the holding's life.
 *
 * Fee-inclusive, matching `_recompute`: a fee raises what a purchase cost
 * (`cost += q*p + fee`) and lowers what a sale returned
 * (`realized += (p-avg)*q - fee`). Reporting gross figures here would make the
 * drawer's "total bought" disagree with the cost basis the backend derived
 * from the very same trades.
 */
export function boughtSoldTotals(txs: AssetTransaction[]): {
  bought: number
  sold: number
  buyCount: number
  sellCount: number
} {
  let bought = 0
  let sold = 0
  let buyCount = 0
  let sellCount = 0
  for (const tx of txs) {
    const gross = tx.quantity * tx.price
    const fee = tx.fee || 0
    if (tx.kind === 'buy') {
      bought += gross + fee
      buyCount += 1
    } else {
      sold += gross - fee
      sellCount += 1
    }
  }
  return { bought, sold, buyCount, sellCount }
}

/**
 * Cumulative cost of the units still held, aligned to the value trend's dates.
 *
 * Plotted against market value, the gap between the two lines is the
 * unrealized gain at any point on the chart — which is what turns the return
 * percentage into something a user can see.
 *
 * A sale removes the average cost of the units sold, mirroring `_recompute`'s
 * `cost -= avg * sell_qty`. This is the one place this module touches
 * average-cost reasoning; it was weighed against plotting cumulative net cash
 * (which needs no average but answers "how much money moved" rather than "what
 * does what I still hold cost") and settled in favor of cost basis at plan
 * approval — see plan.md v1.0.0.
 *
 * Returns `null` when there are no trades, so the caller omits the series
 * instead of drawing a line flat at zero.
 */
export function cumulativeCostSeries(
  trend: { date: string; amount: number }[],
  txs: AssetTransaction[],
): { date: string; cost: number }[] | null {
  if (txs.length === 0 || trend.length === 0) return null

  const sorted = sortByDate(txs)
  const series: { date: string; cost: number }[] = []
  let cursor = 0
  let cost = 0
  let units = 0

  for (const point of trend) {
    // Fold in every trade up to and including this trend date.
    while (cursor < sorted.length && sorted[cursor].date <= point.date) {
      const tx = sorted[cursor]
      const fee = tx.fee || 0
      if (tx.kind === 'buy') {
        cost += tx.quantity * tx.price + fee
        units += tx.quantity
      } else {
        const avg = units > 0 ? cost / units : 0
        const sellQty = Math.min(tx.quantity, units)
        cost -= avg * sellQty
        units -= sellQty
      }
      cursor += 1
    }
    series.push({ date: point.date, cost })
  }
  return series
}

/**
 * Can this asset be selected in the global transactions tab's filter?
 *
 * Keyed on the stored ticker, which every asset entering the ledger through
 * Securo's own flows carries — including Tesouro Direto bonds, whose synthetic
 * `TD:` symbol is meaningless to a market data provider but a perfectly good
 * filter key here.
 *
 * Deliberately NOT the same test as `externalLinksFor`: filterable is a strict
 * superset of externally linkable, and conflating the two would drop Tesouro
 * Direto bonds out of the filter for no reason.
 */
export function hasFilterableTicker(asset: Pick<Asset, 'ticker'>): boolean {
  return !!asset.ticker
}

export type ExternalLinkProvider = 'yahoo' | 'tradingview' | 'google'

export type ExternalLink = {
  provider: ExternalLinkProvider
  url: string
}

/**
 * Third-party destinations for a market-traded holding.
 *
 * Securo links, it never reads: every URL is built from the stored ticker, no
 * request is made to any provider, and no third-party response is parsed or
 * displayed.
 *
 * Quotes come from `yfinance`, so `Asset.ticker` is already a Yahoo symbol
 * (`AAPL`, `PETR4.SA`, `HGLG11.SA`, `BTC-USD`) and Yahoo needs no translation.
 * Google Search cannot 404 and surfaces Google's own finance card at the top of
 * its results. TradingView covers charts and indicators; its suffix-stripping is
 * a heuristic whose worst case is a search page instead of a chart, which is
 * exactly why Google Search is in the set.
 *
 * Google Finance deep links are deliberately absent: `/finance/quote/SYM:EXCH`
 * needs Google's own exchange codes (`BVMF`, `NASDAQ`) while `ticker_exchange`
 * holds Yahoo's display strings (`NasdaqGS`, `São Paulo`). Mapping between them
 * would be a permanent source of silent 404s.
 *
 * Returns `[]` where the ticker cannot identify a publicly traded instrument:
 * manual and growth-rule assets, assets with no ticker, and Tesouro Direto.
 */
export function externalLinksFor(
  asset: Pick<Asset, 'ticker' | 'name' | 'valuation_method'>,
): ExternalLink[] {
  const ticker = asset.ticker?.trim()
  if (!ticker) return []
  if (asset.valuation_method !== 'market_price') return []
  if (ticker.toUpperCase().startsWith(TESOURO_PREFIX)) return []

  const bare = ticker.replace(MARKET_SUFFIX, '')
  const query = encodeURIComponent(`${ticker} ${asset.name ?? ''}`.trim())

  return [
    { provider: 'yahoo', url: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}` },
    { provider: 'tradingview', url: `https://www.tradingview.com/symbols/${encodeURIComponent(bare)}/` },
    { provider: 'google', url: `https://www.google.com/search?q=${query}` },
  ]
}
