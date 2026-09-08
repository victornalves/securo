import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AssetTransaction } from '@/types'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { tradePriceSeries, type TradePricePoint } from '@/lib/asset-detail-utils'
import { formatCurrency } from './asset-format'

const BUY_COLOR = '#10B981'
const SELL_COLOR = '#F43F5E'

/**
 * What was paid per unit, trade by trade.
 *
 * Bars measure each trade's unit price against the holding's **average price**,
 * not against zero. Unit prices cluster tightly in practice — three trades at
 * 5.26, 5.61 and 5.61 against an average of 5.5966 are three identical bars on
 * a zero-based axis, and the chart would show nothing. The average is a real
 * reference, so putting the baseline there exaggerates nothing and answers the
 * question that matters: which trades were above what this position cost me,
 * and which were below.
 *
 * Colour carries direction (the ledger's own emerald/rose), so it never doubles
 * up with the sign the bar already shows by pointing up or down.
 *
 * Independent of the ledger's direction filter below: this block exists to
 * compare every trade against one another, and dropping half of them would
 * leave the average line describing trades that are no longer on screen.
 */
export function TradePriceChart({
  txs,
  averagePrice,
  currency,
  locale,
  dateLocale,
}: {
  txs: AssetTransaction[]
  averagePrice: number | null
  currency: string
  locale: string
  dateLocale: string
}) {
  const { t } = useTranslation()
  const { mask } = usePrivacyMode()

  const series = useMemo(
    () => (averagePrice == null ? [] : tradePriceSeries(txs, averagePrice)),
    [txs, averagePrice],
  )

  // One trade compares nothing, and with no average there is no baseline to
  // measure against — a fully exited position has neither.
  if (averagePrice == null || series.length < 2) return null

  const money = (v: number) => mask(formatCurrency(v, currency, locale))
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`

  return (
    <div className="px-5 py-4 border-b border-border space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('assets.pricePerUnitChart')}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {t('assets.avgPriceBaseline', { price: money(averagePrice) })}
        </p>
      </div>

      <div className="h-40 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) =>
                new Date(v + 'T00:00:00').toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' })
              }
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v: number) => mask(`${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`)}
            />
            {/* The baseline is the average price, and it is labelled as such —
                a reader must never take it for zero. */}
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} strokeDasharray="4 3" />
            <RechartsTooltip
              cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const pt = payload[0].payload as TradePricePoint
                return (
                  <div style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '8px 10px' }}>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>
                      {new Date(pt.date + 'T00:00:00').toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    <div style={{ fontSize: 11, fontWeight: 500, color: pt.kind === 'buy' ? BUY_COLOR : SELL_COLOR, marginBottom: 3 }}>
                      {pt.kind === 'buy' ? t('assets.txBuy') : t('assets.txSell')} · {mask(`${pt.quantity}`)}
                    </div>
                    <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t('assets.unitPrice')}: {money(pt.price)}
                    </div>
                    {/* The practiced price and what it really cost per unit are
                        different numbers whenever there is a fee. */}
                    {Math.abs(pt.effectivePrice - pt.price) > 1e-9 && (
                      <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--muted-foreground)' }}>
                        {t('assets.effectiveUnitPrice')}: {money(pt.effectivePrice)}
                      </div>
                    )}
                    <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, fontWeight: 500, color: pt.deviation >= 0 ? SELL_COLOR : BUY_COLOR }}>
                      {t('assets.vsAvgPrice')}: {signed(pt.deviation)}
                    </div>
                  </div>
                )
              }}
            />
            <Bar dataKey="deviation" radius={[3, 3, 3, 3]} maxBarSize={28}>
              {series.map((pt) => (
                <Cell key={pt.id} fill={pt.kind === 'buy' ? BUY_COLOR : SELL_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
