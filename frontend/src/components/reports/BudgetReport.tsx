import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import {
  buildBudgetChartData,
  chartWidth,
  OUT_OF_BUDGET_KEY,
  type BudgetChartDatum,
} from '@/lib/budget-report-utils'
import type { BudgetReportResponse } from '@/types'

// The envelope bar is a reference, not the subject: muted so the realized bar
// beside it carries the reading.
const BUDGETED_COLOR = '#C7CBD4'
const CHART_HEIGHT = 340
const LABEL_MAX_CHARS = 14

function formatCurrency(value: number, currency: string, locale: string, compact = false) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value)
}

function truncate(label: string) {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label
}

interface BudgetReportProps {
  data?: BudgetReportResponse
  currency: string
  locale: string
  isLoading: boolean
}

export function BudgetReport({ data, currency, locale, isLoading }: BudgetReportProps) {
  const { t } = useTranslation()
  const { mask, privacyMode, MASK } = usePrivacyMode()

  // The chart outgrows its container when there are many categories, so it
  // needs the container's real width to decide when to start scrolling.
  const containerRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const money = (value: number, compact = false) =>
    privacyMode ? MASK : formatCurrency(value, currency, locale, compact)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="bg-card rounded-xl border border-border shadow-sm px-5 py-4">
          <div className="flex items-center gap-8">
            <Skeleton className="h-16 w-48" />
            <div className="flex gap-6">
              <Skeleton className="h-12 w-28" />
              <Skeleton className="h-12 w-28" />
              <Skeleton className="h-12 w-28" />
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border shadow-sm px-5 py-5">
          <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
        </div>
      </div>
    )
  }

  const chartData = data ? buildBudgetChartData(data, t('reports.outOfBudget')) : []
  const summary = data?.summary
  const balance = summary?.balance ?? 0
  const balanceColor = balance >= 0 ? 'text-emerald-600' : 'text-rose-500'

  const metrics = [
    { key: 'budgeted', color: BUDGETED_COLOR, value: summary?.budgeted ?? 0 },
    { key: 'realized', color: '#6366F1', value: summary?.realized ?? 0 },
    { key: 'outOfBudget', color: '#9CA3AF', value: summary?.out_of_budget ?? 0 },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Summary — mirrors the shared hero card's shell and typography, but
          reports budget figures the time-series hero has no room for. */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5 uppercase tracking-wider">
              {t('reports.budgetBalance')}
            </p>
            <p className={`text-3xl font-bold tabular-nums ${balanceColor}`}>
              {mask(formatCurrency(balance, currency, locale))}
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            {metrics.map((metric) => (
              <div key={metric.key} className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: metric.color }}
                  />
                  <p className="text-xs font-medium text-muted-foreground">
                    {t(`reports.${metric.key}`)}
                  </p>
                </div>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {mask(formatCurrency(metric.value, currency, locale))}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            {t('reports.budget')} · {t('reports.byCategory')}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6366F1' }} />
              <span className="text-[11px] text-muted-foreground">{t('reports.realized')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: BUDGETED_COLOR }} />
              <span className="text-[11px] text-muted-foreground">{t('reports.budgeted')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F43F5E' }} />
              <span className="text-[11px] text-muted-foreground">{t('reports.overBudget')}</span>
            </div>
          </div>
        </div>
        <div ref={containerRef} className="px-1 pb-4 overflow-x-auto">
          {chartData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-16">
              {t('reports.noBudgets')}
            </p>
          ) : (
            <BarChart
              width={chartWidth(chartData.length, Math.max(available - 8, 0))}
              height={CHART_HEIGHT}
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 56 }}
              barGap={4}
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                // Every column keeps its label: recharts drops them silently
                // when it is left to pick an interval.
                interval={0}
                angle={-35}
                textAnchor="end"
                height={56}
                tickFormatter={truncate}
              />
              <YAxis
                tickFormatter={(value: number) => {
                  if (privacyMode) return ''
                  if (value === 0) return '0'
                  return formatCurrency(value, currency, locale, true)
                }}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickCount={5}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', fillOpacity: 0.3 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const datum = payload[0].payload as BudgetChartDatum
                  const isOutOfBudget = datum.key === OUT_OF_BUDGET_KEY
                  const difference = (datum.budgeted ?? 0) - datum.realized
                  const percentage =
                    datum.budgeted && datum.budgeted > 0
                      ? (datum.realized / datum.budgeted) * 100
                      : null
                  return (
                    <div
                      className="px-3 py-2 rounded-xl text-xs"
                      style={{
                        background: 'var(--card)',
                        color: 'var(--foreground)',
                        border: '1px solid var(--border)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                    >
                      <p className="font-semibold mb-1">{datum.label}</p>
                      <p>
                        {t('reports.realized')}: {money(datum.realized)}
                      </p>
                      {!isOutOfBudget && (
                        <>
                          <p>
                            {t('reports.budgeted')}: {money(datum.budgeted ?? 0)}
                          </p>
                          <p className={difference >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
                            {t('reports.difference')}: {money(difference)}
                          </p>
                          {percentage !== null && (
                            <p className="text-muted-foreground">
                              {t('reports.percentUsed', { percent: percentage.toFixed(1) })}
                            </p>
                          )}
                          {datum.coverage && (
                            // Partial coverage reads as a blowout without this
                            // line: a full window of spending against an
                            // envelope that only covers part of it.
                            <p className="text-muted-foreground mt-1 pt-1 border-t border-border/50">
                              {/* `months`, not `count` — i18next treats a
                                  `count` variable as a plural selector and
                                  would look for suffixed keys. */}
                              {t('reports.budgetCoverage', {
                                months: datum.coverage.budgeted,
                                total: datum.coverage.total,
                              })}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )
                }}
              />
              <Bar dataKey="realized" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {chartData.map((datum) => (
                  <Cell key={datum.key} fill={datum.color} />
                ))}
              </Bar>
              <Bar
                dataKey="budgeted"
                fill={BUDGETED_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          )}
        </div>
      </div>
    </div>
  )
}
