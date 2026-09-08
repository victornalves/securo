import { useTranslation } from 'react-i18next'
import { AlertTriangle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Asset } from '@/types'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { formatCurrency, formatRelativeTime } from './asset-format'

/**
 * What the holding is, right now.
 *
 * Presentational by design: every figure here comes straight off the `Asset`
 * payload. `asset_transaction_service._recompute` is the single authority on
 * cost basis, average price and realized gain (spec 008 D5), so this component
 * contains no cost arithmetic — if a number is not on the payload, it does not
 * belong in this block.
 */
function Figure({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string | null
  tone?: 'default' | 'positive' | 'negative'
}) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-600' : tone === 'negative' ? 'text-rose-500' : 'text-foreground'
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
        {label}
      </p>
      <p className={`text-sm font-semibold tabular-nums truncate ${toneClass}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
    </div>
  )
}

export function PositionSummary({
  asset,
  portfolioTotalPrimary,
  userCurrency,
  locale,
  canWrite,
  onRecordBuy,
}: {
  asset: Asset
  portfolioTotalPrimary: number
  userCurrency: string
  locale: string
  canWrite: boolean
  onRecordBuy: () => void
}) {
  const { t } = useTranslation()
  const { mask } = usePrivacyMode()

  const cur = asset.currency
  const hasCost = asset.average_price != null && asset.total_invested != null
  const isClosed = !!asset.sell_date && (asset.units ?? 0) === 0
  const needsBuys = !hasCost && !asset.sell_date

  const returnPct =
    hasCost && asset.gain_loss != null && asset.total_invested
      ? (asset.gain_loss / asset.total_invested) * 100
      : null
  const pctOfPortfolio =
    portfolioTotalPrimary > 0 && asset.current_value_primary != null
      ? (asset.current_value_primary / portfolioTotalPrimary) * 100
      : null

  const money = (v: number | null | undefined, currency = cur) =>
    v == null ? '—' : mask(formatCurrency(v, currency, locale))

  // A closed position has no quantity, no average price and no unrealized
  // return to report — realized gain is the whole story, so it leads.
  if (isClosed) {
    return (
      <div className="px-5 py-4 border-b border-border bg-muted/20">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          {t('assets.realizedGain')}
        </p>
        <p
          className={`text-xl font-bold tabular-nums ${
            (asset.realized_gain ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'
          }`}
        >
          {money(asset.realized_gain)}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {t('assets.positionClosedOn', {
            date: asset.sell_date ? new Date(asset.sell_date + 'T00:00:00').toLocaleDateString(locale) : '',
          })}
        </p>
      </div>
    )
  }

  return (
    <div className="px-5 py-4 border-b border-border bg-muted/20 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        <Figure
          label={t('assets.colQuantity')}
          value={asset.units != null ? mask(`${asset.units}`) : '—'}
        />
        <Figure label={t('assets.colAvgPrice')} value={money(asset.average_price)} />
        <Figure
          label={t('assets.colCurrentPrice')}
          value={money(asset.last_price)}
          hint={
            asset.last_price_at
              ? t('assets.lastUpdated', { when: formatRelativeTime(asset.last_price_at, locale) })
              : null
          }
        />
        <Figure
          label={t('assets.colBalance')}
          value={money(asset.current_value)}
          hint={
            asset.current_value_primary != null && cur !== userCurrency
              ? money(asset.current_value_primary, userCurrency)
              : null
          }
        />
        <Figure label={t('assets.totalInvested')} value={money(asset.total_invested)} />
        <Figure
          label={t('assets.unrealizedGain')}
          value={money(asset.gain_loss)}
          hint={returnPct != null ? `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%` : null}
          tone={asset.gain_loss == null ? 'default' : asset.gain_loss >= 0 ? 'positive' : 'negative'}
        />
        <Figure
          label={t('assets.realizedGain')}
          value={money(asset.realized_gain)}
          tone={
            asset.realized_gain == null || asset.realized_gain === 0
              ? 'default'
              : asset.realized_gain > 0
                ? 'positive'
                : 'negative'
          }
        />
        <Figure
          label={t('assets.colPortfolioPct')}
          value={pctOfPortfolio != null ? `${pctOfPortfolio.toFixed(1)}%` : '—'}
        />
      </div>

      {/* Without recorded buys there is no cost basis, so average price and
          return cannot be computed — say that rather than rendering zeros. */}
      {needsBuys && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
          <AlertTriangle size={15} className="text-amber-500 shrink-0" />
          <p className="flex-1 text-[11px] text-amber-800 dark:text-amber-300/90">
            {t('assets.noPriceWarning')}
          </p>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs gap-1 border-amber-400 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40 shrink-0"
              onClick={onRecordBuy}
            >
              <Plus size={13} />
              {t('assets.addBuys')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
