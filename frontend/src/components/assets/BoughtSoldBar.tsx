import { useTranslation } from 'react-i18next'
import type { AssetTransaction } from '@/types'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { boughtSoldTotals } from '@/lib/asset-detail-utils'
import { formatCurrency } from './asset-format'

/**
 * What went in versus what came out, over the holding's life.
 *
 * The arithmetic lives in `lib/asset-detail-utils` where it is tested; this
 * renders it. Figures are fee-inclusive, matching `_recompute`: a fee raises
 * what a purchase cost and lowers what a sale returned — so "total bought"
 * here agrees with the cost basis the backend derived from the same trades.
 */
export function BoughtSoldBar({
  txs,
  currency,
  currentValue,
  locale,
}: {
  txs: AssetTransaction[]
  currency: string
  currentValue: number | null
  locale: string
}) {
  const { t } = useTranslation()
  const { mask } = usePrivacyMode()

  const { bought, sold, buyCount, sellCount } = boughtSoldTotals(txs)

  // Nothing to compare without trades — the caller shows no block at all
  // rather than a row of zeros.
  if (buyCount === 0 && sellCount === 0) return null

  const held = currentValue ?? 0
  const scale = Math.max(bought, sold + held, 1)
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`

  return (
    <div className="px-5 py-4 border-b border-border space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {t('assets.boughtVsSold')}
      </p>

      <div className="space-y-2">
        {/* Bought: the full bar's reference length. */}
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[11px] text-muted-foreground">
              {t('assets.totalBought', { n: buyCount })}
            </span>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {mask(formatCurrency(bought, currency, locale))}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: pct(bought) }} />
          </div>
        </div>

        {/* Sold plus what is still held, drawn on the same scale so the two
            rows can be read against each other. */}
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[11px] text-muted-foreground">
              {sellCount > 0
                ? t('assets.totalSold', { n: sellCount })
                : t('assets.currentPosition')}
            </span>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {sellCount > 0
                ? mask(formatCurrency(sold, currency, locale))
                : mask(formatCurrency(held, currency, locale))}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            {sellCount > 0 && (
              <div className="h-full bg-rose-500" style={{ width: pct(sold) }} title={t('assets.totalSold', { n: sellCount })} />
            )}
            <div className="h-full bg-sky-500" style={{ width: pct(held) }} title={t('assets.currentPosition')} />
          </div>
        </div>
      </div>

      {sellCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t('assets.stillHeld')}{' '}
          <span className="tabular-nums font-medium text-foreground">
            {mask(formatCurrency(held, currency, locale))}
          </span>
        </p>
      )}
    </div>
  )
}
