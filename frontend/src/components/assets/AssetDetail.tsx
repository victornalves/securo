import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assets } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { AssetTransaction, AssetValue } from '@/types'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { formatCurrency, assetErrorMessage } from './asset-format'
import { cumulativeCostSeries } from '@/lib/asset-detail-utils'

// Marker drawn on the value chart where a buy (green) or sell (red) happened.
// Recharts calls this per data point; non-trade points render an empty group.
// Cost basis is a reference line, not a signal: it must not borrow the
// emerald/rose the value line uses to mean up or down. Slate-500 holds up on
// both themes.
const COST_SERIES_COLOR = '#64748B'

function renderAssetTradeDot(props: {
  cx?: number; cy?: number; index?: number; payload?: { trades?: AssetTransaction[] }
}) {
  const { cx, cy, index, payload } = props
  const trades = payload?.trades
  if (cx == null || cy == null || !trades || trades.length === 0) {
    return <g key={`td-${index}`} />
  }
  const hasBuy = trades.some(t => t.kind === 'buy')
  const hasSell = trades.some(t => t.kind === 'sell')
  const color = hasSell && !hasBuy ? '#F43F5E' : hasBuy && !hasSell ? '#10B981' : '#6366F1'
  return (
    <circle key={`td-${index}`} cx={cx} cy={cy} r={4} fill={color} stroke="var(--card)" strokeWidth={1.5} />
  )
}

export function AssetDetail({ assetId, currency, locale: loc, dateLocale: dateLoc, purchasePrice, purchaseDate, valuationMethod, hasLedger = false, canWrite, chartOnly = false }: {
  assetId: string; currency: string; locale: string; dateLocale: string
  purchasePrice: number | null; purchaseDate: string | null
  valuationMethod: string
  /** Whether trades drive this holding — see `isLedgerBacked`. Not the same as
      `valuationMethod === 'market_price'`: a manual asset can carry a ledger. */
  hasLedger?: boolean
  canWrite: boolean
  // When true, render only the value-evolution chart (used above the ledger
  // for market-priced holdings) — no manual value form / value-history list.
  chartOnly?: boolean
}) {
  const { t } = useTranslation()
  const { mask } = usePrivacyMode()
  const queryClient = useQueryClient()

  const [valueAmount, setValueAmount] = useState('')
  const [valueDate, setValueDate] = useState(new Date().toISOString().slice(0, 10))

  const { data: values, isLoading: valuesLoading } = useQuery({
    queryKey: ['asset-values', assetId],
    queryFn: () => assets.values(assetId),
  })

  const { data: trend } = useQuery({
    queryKey: ['asset-trend', assetId],
    queryFn: () => assets.valueTrend(assetId),
  })

  // Build full trend: purchase point + stored values
  const trendWithPurchase = useMemo(() => {
    if (!trend) return []
    let result = [...trend]

    // Prepend purchase point if it predates the first value
    if (purchasePrice && purchaseDate) {
      if (result.length === 0 || purchaseDate < result[0].date) {
        result = [{ date: purchaseDate, amount: purchasePrice }, ...result]
      }
    }

    return result
  }, [trend, purchasePrice, purchaseDate])

  // Buy/sell markers on the value chart (shares the ledger's query cache).
  // Without these, a jump in the line could be either a price move or a
  // quantity change — the markers label "you bought/sold here".
  const { data: assetTrades } = useQuery({
    queryKey: ['asset-transactions', assetId],
    queryFn: () => assets.transactions(assetId),
    enabled: hasLedger || valuationMethod === 'market_price',
  })
  // Cumulative cost of the units still held, on the same axis as market value:
  // the gap between the two lines IS the unrealized gain at that point, which
  // turns the return percentage into something visible (spec 008 D4). `null`
  // for a tradeless holding, so the series is omitted rather than drawn flat
  // at zero.
  const costSeries = useMemo(
    () => cumulativeCostSeries(trendWithPurchase, assetTrades ?? []),
    [trendWithPurchase, assetTrades],
  )
  const hasCostSeries = !!costSeries

  const chartData = useMemo(() => {
    const pts = trendWithPurchase.map((p, i) => ({
      ...p,
      trades: [] as AssetTransaction[],
      cost: costSeries ? costSeries[i]?.cost : undefined,
    }))
    if (!assetTrades || pts.length === 0) return pts
    for (const tx of assetTrades) {
      const txTime = new Date(tx.date + 'T00:00:00').getTime()
      let best = 0
      let bestDiff = Infinity
      for (let i = 0; i < pts.length; i++) {
        const diff = Math.abs(new Date(pts[i].date + 'T00:00:00').getTime() - txTime)
        if (diff < bestDiff) { bestDiff = diff; best = i }
      }
      pts[best].trades.push(tx)
    }
    return pts
  }, [trendWithPurchase, assetTrades, costSeries])

  // Build value history with purchase as the initial entry
  const valuesWithPurchase = useMemo(() => {
    if (!values) return []
    if (!purchasePrice || !purchaseDate) return values
    const hasPurchaseValue = values.some(v => v.date === purchaseDate && v.amount === purchasePrice)
    if (hasPurchaseValue) return values
    const purchaseEntry: AssetValue = {
      id: 'purchase',
      asset_id: assetId,
      amount: purchasePrice,
      date: purchaseDate,
      source: 'purchase',
    }
    return [...values, purchaseEntry]
  }, [values, purchasePrice, purchaseDate, assetId])

  const addValueMutation = useMutation({
    mutationFn: ({ assetId: id, ...data }: { assetId: string; amount: number; date: string }) =>
      assets.addValue(id, data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['assets'] })
      queryClient.refetchQueries({ queryKey: ['asset-values', assetId] })
      queryClient.refetchQueries({ queryKey: ['asset-trend', assetId] })
      queryClient.refetchQueries({ queryKey: ['portfolio-trend'] })
      queryClient.refetchQueries({ queryKey: ['dashboard'] })
      setValueAmount('')
      toast.success(t('assets.valueAdded'))
    },
    onError: (e) => toast.error(assetErrorMessage(e, t('common.error'))),
  })

  const deleteValueMutation = useMutation({
    mutationFn: (valueId: string) => assets.deleteValue(valueId),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['assets'] })
      queryClient.refetchQueries({ queryKey: ['asset-values', assetId] })
      queryClient.refetchQueries({ queryKey: ['asset-trend', assetId] })
      queryClient.refetchQueries({ queryKey: ['portfolio-trend'] })
      queryClient.refetchQueries({ queryKey: ['dashboard'] })
      toast.success(t('assets.valueDeleted'))
    },
    onError: (e) => toast.error(assetErrorMessage(e, t('common.error'))),
  })

  // Determine chart color based on trend direction
  const trendIsPositive = trendWithPurchase.length >= 2
    ? trendWithPurchase[trendWithPurchase.length - 1].amount >= trendWithPurchase[0].amount
    : true
  const chartColor = trendIsPositive ? '#10B981' : '#F43F5E'

  const negativeValuation = !!valueAmount && parseFloat(valueAmount) < 0

  const hasChart = trendWithPurchase.length > 1
  // In chart-only mode (market-priced holdings, paired with the ledger) there's
  // nothing to show until the value series has at least two points.
  if (chartOnly && !hasChart) return null

  return (
    <div className="border-t border-border px-5 py-5 space-y-5 bg-muted/5">
      {/* Value Trend Chart */}
      {hasChart && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t('assets.valueTrend')}</p>
            {hasCostSeries && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full" style={{ background: chartColor }} />
                  {t('assets.seriesMarketValue')}
                </span>
                <span className="flex items-center gap-1.5">
                  {/* Dashed swatch, matching the line: the two series must be
                      distinguishable without relying on colour alone. */}
                  <span
                    className="w-3 h-0 border-t border-dashed"
                    style={{ borderColor: COST_SERIES_COLOR }}
                  />
                  {t('assets.seriesCostBasis')}
                </span>
              </div>
            )}
          </div>
          <div className="h-44 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`gradient-${assetId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => new Date(v + 'T00:00:00').toLocaleDateString(dateLoc, { month: 'short', year: '2-digit' })}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v: number) => {
                    const abs = Math.abs(v)
                    let formatted: string
                    if (abs >= 1_000_000) formatted = `${(v / 1_000_000).toFixed(1)}M`
                    else if (abs >= 1_000) formatted = `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
                    else formatted = v.toLocaleString(loc, { maximumFractionDigits: 0 })
                    return mask(formatted)
                  }}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const pt = payload[0].payload as { amount?: number; cost?: number; trades?: AssetTransaction[] }
                    return (
                      <div style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '8px 10px' }}>
                        <p style={{ fontWeight: 600, marginBottom: 4 }}>
                          {new Date(String(label) + 'T00:00:00').toLocaleDateString(dateLoc, { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        <div style={{ fontVariantNumeric: 'tabular-nums' }}>{mask(formatCurrency(pt.amount ?? 0, currency, loc))}</div>
                        {pt.cost != null && (
                          <>
                            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--muted-foreground)' }}>
                              {t('assets.seriesCostBasis')}: {mask(formatCurrency(pt.cost, currency, loc))}
                            </div>
                            {/* The gap between the lines, spelled out — it is the
                                whole reason the second series is here. */}
                            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, fontWeight: 500, color: (pt.amount ?? 0) - pt.cost >= 0 ? '#10B981' : '#F43F5E' }}>
                              {t('assets.unrealizedGain')}: {mask(formatCurrency((pt.amount ?? 0) - pt.cost, currency, loc))}
                            </div>
                          </>
                        )}
                        {pt.trades?.map((tx) => (
                          <div key={tx.id} style={{ marginTop: 3, fontSize: 11, fontWeight: 500, color: tx.kind === 'buy' ? '#10B981' : '#F43F5E' }}>
                            {tx.kind === 'buy' ? t('assets.txBuy') : t('assets.txSell')} {mask(`${tx.quantity}`)} × {mask(formatCurrency(tx.price, currency, loc))}
                          </div>
                        ))}
                      </div>
                    )
                  }}
                />
                {hasCostSeries && (
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke={COST_SERIES_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    fill="none"
                    dot={false}
                    activeDot={false}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={chartColor}
                  strokeWidth={2}
                  fill={`url(#gradient-${assetId})`}
                  dot={renderAssetTradeDot}
                  activeDot={{ r: 4, strokeWidth: 2, fill: 'var(--card)', stroke: chartColor }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Revaluation form — only for manual assets.
          This records what the asset is WORTH on a date: an absolute figure
          that replaces the previous one, not a delta and not a trade. Users
          were reading it as "add a transaction" and reasoning that a negative
          amount must be a sale — it is not; it would simply make the asset
          worth a negative amount. Hence the explicit heading, the explanation,
          and the `min={0}` guard below (spec 008 D2). */}
      {!chartOnly && valuationMethod === 'manual' && canWrite && <div className="space-y-2">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t('assets.recordValuation')}
          </p>
          <p className="text-[11px] text-muted-foreground">{t('assets.valuationExplainer')}</p>
        </div>
        <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-[11px] text-muted-foreground">{t('assets.valuationAmount')}</Label>
          <Input
            type="number"
            step="any"
            min={0}
            value={valueAmount}
            onChange={e => setValueAmount(e.target.value)}
            placeholder="0.00"
            className="h-8 text-sm"
          />
        </div>
        <div className="w-36">
          <Label className="text-[11px] text-muted-foreground">{t('assets.asOfDate')}</Label>
          <DatePickerInput value={valueDate} onChange={setValueDate} />
        </div>
        <Button
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={!valueAmount || negativeValuation || addValueMutation.isPending}
          onClick={() => {
            if (valueAmount && !negativeValuation) {
              addValueMutation.mutate({
                assetId,
                amount: parseFloat(valueAmount),
                date: valueDate,
              })
            }
          }}
        >
          <Plus size={14} className="mr-1" />
          {t('assets.saveValuation')}
        </Button>
        </div>
        {/* Names the mistake instead of clamping it silently: a disposal is a
            different thing, and this control cannot express one. */}
        {negativeValuation && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertTriangle size={12} className="shrink-0" />
            {t('assets.negativeValuation')}
          </p>
        )}
      </div>}

      {/* Value History */}
      {!chartOnly && <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('assets.valuationHistory')}</p>
        {valuesLoading ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : valuesWithPurchase.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
            {valuesWithPurchase.map((v: AssetValue, idx: number) => {
              const isPurchase = v.source === 'purchase'
              // Calculate change from previous entry (next in array since sorted desc)
              const prev = valuesWithPurchase[idx + 1]
              const change = prev ? v.amount - prev.amount : null
              const changePct = prev && prev.amount !== 0 ? (change! / prev.amount) * 100 : null

              return (
                <div key={v.id} className={`flex items-center justify-between py-2 px-3 transition-colors ${isPurchase ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm tabular-nums font-semibold text-foreground">
                      {mask(formatCurrency(v.amount, currency, loc))}
                    </span>
                    {change != null && (
                      <span className={`text-[11px] tabular-nums font-medium ${change >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {change >= 0 ? '+' : ''}{mask(formatCurrency(change, currency, loc))}
                        {changePct != null && ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={isPurchase ? 'default' : 'outline'} className={`text-[10px] px-1.5 py-0 ${isPurchase ? 'bg-primary/15 text-primary border-primary/30' : ''}`}>
                      {t(`assets.source${v.source.charAt(0).toUpperCase() + v.source.slice(1)}`)}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {new Date(v.date + 'T00:00:00').toLocaleDateString(dateLoc)}
                    </span>
                    {valuationMethod === 'manual' && v.source === 'manual' && canWrite && (
                      <button
                        onClick={() => deleteValueMutation.mutate(v.id)}
                        className="p-1 rounded text-muted-foreground/40 hover:text-rose-600 transition-colors"
                        disabled={deleteValueMutation.isPending}
                        title={t('common.delete')}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-3 text-center">{t('dashboard.noData')}</p>
        )}
      </div>}
    </div>
  )
}
