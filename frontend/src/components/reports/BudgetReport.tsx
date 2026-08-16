import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
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
  OVER_BUDGET_COLOR,
  type BudgetChartDatum,
} from '@/lib/budget-report-utils'
import type { BudgetReportResponse } from '@/types'

// The envelope is a reference, not the subject: one neutral, deliberately
// achromatic so it never competes with a category's own colour. Held at low
// opacity it works on both the light and the dark surface.
const NEUTRAL = '#9CA3AF'
const TRACK_OPACITY = 0.38

// Plot height plus the band the rotated category labels need. Sizing the
// container to the plot alone is what crops axis labels.
const PLOT_HEIGHT = 300
const AXIS_BAND = 84
const CHART_HEIGHT = PLOT_HEIGHT + AXIS_BAND
const LABEL_MAX_CHARS = 16
const LABEL_ANGLE = -35
// White doing the separating: the gap between the within-budget segment and
// the overspend cap above it, and between adjacent bars.
const SURFACE_GAP = 2
const BAR_SIZE = 24

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

/**
 * Rotated category label. Recharts' own `angle` prop rotates around a point it
 * derives from the tick, which drifts the text off its column; anchoring the
 * end of the string at the tick and rotating about that same point keeps every
 * label under the bar it names.
 */
function CategoryTick({ x, y, payload }: {
  x?: number
  y?: number
  payload?: { value?: string }
}) {
  return (
    <g transform={`translate(${x ?? 0},${(y ?? 0) + 10})`}>
      <text
        transform={`rotate(${LABEL_ANGLE})`}
        textAnchor="end"
        fontSize={11}
        fill="var(--muted-foreground)"
      >
        {truncate(payload?.value ?? '')}
      </text>
    </g>
  )
}

/**
 * The realized column. Within-budget spending keeps the category's own colour;
 * anything past the envelope is capped in rose, separated by the surface gap.
 * Repainting the whole bar would have thrown away the identity colour to say
 * something the cap says better — and says *how much* over, not just that.
 */
function RealizedBar(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: BudgetChartDatum
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props
  if (!payload || height <= 0) return null

  const isOutOfBudget = payload.key === OUT_OF_BUDGET_KEY
  const fill = isOutOfBudget ? 'url(#budgetOutOfBudgetHatch)' : payload.color
  const budgeted = payload.budgeted ?? 0

  if (!payload.over || budgeted <= 0) {
    return <Rectangle x={x} y={y} width={width} height={height} radius={[4, 4, 0, 0]} fill={fill} />
  }

  const excessHeight = Math.max((height * (payload.realized - budgeted)) / payload.realized, 3)
  const withinHeight = Math.max(height - excessHeight - SURFACE_GAP, 0)
  return (
    <g>
      <Rectangle
        x={x} y={y} width={width} height={excessHeight}
        radius={[4, 4, 0, 0]} fill={OVER_BUDGET_COLOR}
      />
      <Rectangle
        x={x} y={y + excessHeight + SURFACE_GAP} width={width} height={withinHeight}
        radius={0} fill={fill}
      />
    </g>
  )
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
    { key: 'budgeted', color: NEUTRAL, value: summary?.budgeted ?? 0 },
    { key: 'realized', color: '#6366F1', value: summary?.realized ?? 0 },
    { key: 'outOfBudget', color: NEUTRAL, value: summary?.out_of_budget ?? 0 },
  ]

  // The realized bars wear each category's own colour, so a single swatch would
  // misrepresent them: the legend key samples the colours actually on screen.
  const legendGradient = chartData
    .filter((datum) => datum.key !== OUT_OF_BUDGET_KEY)
    .slice(0, 3)
    .map((datum) => datum.color)

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
              <div
                className="w-4 h-2 rounded-sm"
                style={{
                  backgroundImage: legendGradient.length > 1
                    ? `linear-gradient(90deg, ${legendGradient.join(', ')})`
                    : undefined,
                  backgroundColor: legendGradient[0] ?? '#6366F1',
                }}
              />
              <span className="text-[11px] text-muted-foreground">{t('reports.realized')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 h-2 rounded-sm"
                style={{ backgroundColor: NEUTRAL, opacity: TRACK_OPACITY }}
              />
              <span className="text-[11px] text-muted-foreground">{t('reports.budgeted')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-2 rounded-sm" style={{ backgroundColor: OVER_BUDGET_COLOR }} />
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
              margin={{ top: 8, right: 24, left: 0, bottom: AXIS_BAND }}
              barGap={SURFACE_GAP}
              barCategoryGap="22%"
            >
              <defs>
                {/* Texture, not hue, says "this is not a category": the column
                    aggregates everything spent where no envelope exists. */}
                <pattern
                  id="budgetOutOfBudgetHatch"
                  width={6} height={6}
                  patternTransform="rotate(45)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width={6} height={6} fill={NEUTRAL} fillOpacity={0.28} />
                  <line x1={0} y1={0} x2={0} y2={6} stroke={NEUTRAL} strokeWidth={2.5} />
                </pattern>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                // Every column keeps its label: recharts drops them silently
                // when it is left to pick an interval.
                interval={0}
                height={AXIS_BAND}
                tick={<CategoryTick />}
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
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: datum.color }}
                        />
                        <p className="font-semibold">{datum.label}</p>
                      </div>
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
              <Bar dataKey="realized" maxBarSize={BAR_SIZE} shape={<RealizedBar />} />
              <Bar
                dataKey="budgeted"
                fill={NEUTRAL}
                fillOpacity={TRACK_OPACITY}
                radius={[4, 4, 0, 0]}
                maxBarSize={BAR_SIZE}
              />
            </BarChart>
          )}
        </div>
      </div>
    </div>
  )
}
