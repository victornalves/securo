import { useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useDisplayLocale, useDateLocale } from '@/hooks/use-display-locale'
import { useQuery } from '@tanstack/react-query'
import { transactions as transactionsApi, dashboard, admin } from '@/lib/api'
import { AlertTriangle, Info, Paperclip, X } from 'lucide-react'
import { CategoryIcon } from '@/components/category-icon'
import { useAuth } from '@/contexts/auth-context'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import {
  buildDrillDownItems,
  summarizeDrillDown,
  type DrillDownFilter,
} from '@/lib/drill-down-utils'
import type { Transaction } from '@/types'

export type { DrillDownFilter }

function formatCurrency(value: number, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
}

export function TransactionDrillDown({
  filter,
  onClose,
  onTransactionClick,
}: {
  filter: DrillDownFilter | null
  onClose: () => void
  onTransactionClick?: (tx: Transaction) => void
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { mask } = usePrivacyMode()
  const userCurrency = user?.preferences?.currency_display ?? 'USD'
  const locale = useDisplayLocale()
  const dateLocale = useDateLocale()
  const panelRef = useRef<HTMLDivElement>(null)

  const includePlanned = user?.preferences?.include_planned ?? false
  // The uncategorized drawer explains `pending_categorization`, a plain row
  // count with no status predicate — so it lists planned rows in both
  // preference states. Every other drawer explains a preference-dependent
  // P&L figure and follows the preference (006/D3).
  const pnlIncludePlanned = filter?.uncategorized ? true : includePlanned

  const { data, isLoading } = useQuery({
    // The preference belongs in the key, not in IncludePlannedToggle's
    // invalidation list: it is part of the request, so keying on it can't be
    // forgotten the way registering a fifth consumer over there could.
    queryKey: ['drill-down', filter, pnlIncludePlanned],
    queryFn: () =>
      transactionsApi.list({
        category_id: filter?.category_id,
        uncategorized: filter?.uncategorized,
        account_id: filter?.account_id,
        account_ids: filter?.account_ids,
        type: filter?.type,
        from: filter?.from,
        to: filter?.to,
        limit: 200,
        user_pnl_only: true,
        pnl_include_planned: pnlIncludePlanned,
      }),
    enabled: !!filter,
  })

  // Derive month param from filter.from for projected transactions
  const monthParam = filter?.from ? filter.from.slice(0, 7) + '-01' : undefined

  const { data: projectedTxs } = useQuery({
    queryKey: ['dashboard', 'projected-transactions', monthParam],
    queryFn: () => dashboard.projectedTransactions(monthParam),
    enabled: !!filter && !!monthParam,
  })

  const { data: accountingModeData } = useQuery({
    queryKey: ['admin', 'accounting-mode'],
    queryFn: () => admin.accountingMode(),
    staleTime: 5 * 60 * 1000,
  })
  const isAccrual = accountingModeData?.mode === 'accrual'

  // Merge real + projected transactions, filtering projected by drill-down criteria
  const displayItems = useMemo(
    () =>
      buildDrillDownItems({
        transactions: data?.items ?? [],
        projections: projectedTxs ?? [],
        filter,
      }),
    [data, projectedTxs, filter],
  )

  // Close on Escape
  useEffect(() => {
    if (!filter) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [filter, onClose])

  // Close on click outside
  useEffect(() => {
    if (!filter) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid closing immediately from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [filter, onClose])

  const { absTotal, plannedCount, plannedTotal } = summarizeDrillDown(
    displayItems,
    userCurrency,
  )

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${
          filter ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-card shadow-2xl z-50 transform transition-transform duration-200 ease-out flex flex-col ${
          filter ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground truncate pr-4">
            {filter?.title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        {isAccrual && filter?.from && (
          <div className="flex items-start gap-2 px-5 py-2.5 bg-muted/40 border-b border-border text-[11px] text-muted-foreground shrink-0">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>{t('dashboard.accrualNote')}</span>
          </div>
        )}

        {/* Transaction list */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : displayItems.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-12">
              {t('dashboard.drillDownEmpty')}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {displayItems.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center gap-3 px-5 py-3 hover:bg-muted transition-colors ${item.kind !== 'projected' ? 'cursor-pointer' : ''}`}
                  onClick={() => {
                    if (item.kind !== 'projected' && item.transaction) {
                      onTransactionClick?.(item.transaction)
                    }
                  }}
                >
                  <CategoryIcon
                    icon={item.categoryIcon}
                    color={item.categoryColor}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{item.description}</p>
                      {/* Violet is the transactions view's colour for a planned
                          row, so it belongs to planned here too; projections
                          take the primary tint that view uses for recurring. */}
                      {item.kind === 'planned' && (
                        <span
                          className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-500/20 border border-violet-200 dark:border-violet-500/30 px-1.5 py-0.5 rounded-full"
                          title={t('transactions.plannedHint')}
                        >
                          {t('transactions.plannedBadge')}
                        </span>
                      )}
                      {/* No tooltip on the projection badge:
                          `recurringLinkedTooltip` describes a stored row linked
                          to a rule, which a projection is not — it has no row. */}
                      {item.kind === 'projected' && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/5 border border-primary/10 px-1.5 py-0.5 rounded-full">
                          {t('transactions.recurringBadge')}
                        </span>
                      )}
                      {item.attachmentCount > 0 && (
                        <Paperclip size={12} className="text-muted-foreground shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.date + 'T00:00:00').toLocaleDateString(dateLocale)}
                      {item.categoryName && ` · ${item.categoryName}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        item.type === 'credit' ? 'text-emerald-600' : 'text-rose-500'
                      }`}
                    >
                      {item.type === 'credit' ? '+' : '-'}
                      {mask(formatCurrency(Math.abs(item.amount), item.currency ?? userCurrency, locale))}
                    </span>
                    {item.currency !== userCurrency && item.amountPrimary != null && (
                      <div className="flex items-center justify-end gap-1">
                        {item.transaction?.fx_fallback && (
                          <span title={t('transactions.fxFallbackTooltip')}><AlertTriangle size={11} className="text-amber-500 shrink-0" /></span>
                        )}
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {mask(formatCurrency(Math.abs(item.amountPrimary), userCurrency, locale))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {displayItems.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-muted/50 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {t('dashboard.drillDownTotal', {
                  count: displayItems.length,
                  total: mask(formatCurrency(absTotal, userCurrency, locale)),
                })}
              </span>
              <span className="text-sm font-bold tabular-nums text-foreground">
                {mask(formatCurrency(absTotal, userCurrency, locale))}
              </span>
            </div>
            {/* One total — it has to equal the figure this drawer was opened
                from. This line says how much of it is commitment rather than
                history, which two competing headline figures could not do. */}
            {plannedCount > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {t('dashboard.drillDownPlannedNote', {
                  count: plannedCount,
                  total: mask(formatCurrency(plannedTotal, userCurrency, locale)),
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
