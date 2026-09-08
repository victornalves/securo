import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { X, Plus, Minus } from 'lucide-react'
import { assets as assetsApi } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Asset } from '@/types'
import { AssetIcon } from './AssetIcon'
import { getTypeConfig } from './asset-types'
import { AssetDetail } from './AssetDetail'
import { HoldingLedger } from './HoldingLedger'
import { PositionSummary } from './PositionSummary'
import { BoughtSoldBar } from './BoughtSoldBar'

/**
 * The single detail surface for one holding.
 *
 * Replaces the inline row expansion the holdings table used to render: keeping
 * both would mean maintaining the chart and the ledger in two layouts and
 * would give the user two different answers to the same click (spec 008 D1).
 *
 * Panel mechanics follow `components/transaction-drill-down.tsx`, the
 * established drawer in this codebase — backdrop, panel pinned right, Escape
 * and click-outside to dismiss, header naming the subject. It is deliberately
 * wider: the drill-down carries one list, this carries a summary, a chart, a
 * comparison and a filtered list.
 *
 * Two bodies, selected by `valuation_method`:
 *  - `market_price` → the trade ledger, with buy and sell actions
 *  - `manual` / `growth_rule` → valuation history, and no trade actions,
 *    because a revaluation is not a trade (spec 008 D2)
 *
 * The asset arrives as a prop. `pages/assets.tsx` already holds the whole list
 * under the `['assets']` query key, so this must not fetch it again; it fetches
 * only the per-asset series its bodies need.
 */
export function AssetDetailDrawer({
  asset,
  portfolioTotalPrimary,
  userCurrency,
  locale,
  dateLocale,
  canWrite,
  onClose,
  onAddTransaction,
  onChanged,
}: {
  /** `null` closes the drawer. */
  asset: Asset | null
  /** Page-level total, so "% of portfolio" is not recomputed here. */
  portfolioTotalPrimary: number
  userCurrency: string
  locale: string
  dateLocale: string
  canWrite: boolean
  onClose: () => void
  onAddTransaction: (assetId: string, kind: 'buy' | 'sell') => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)

  // Same query key as HoldingLedger and the chart's trade markers, so all
  // three read one cached response rather than issuing three requests.
  const { data: txs } = useQuery({
    queryKey: ['asset-transactions', asset?.id],
    queryFn: () => assetsApi.transactions(asset!.id),
    enabled: !!asset && asset.valuation_method === 'market_price',
  })

  // Close on Escape
  useEffect(() => {
    if (!asset) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [asset, onClose])

  // Close on click outside. Delayed registration so the click that opened the
  // drawer does not immediately close it again.
  useEffect(() => {
    if (!asset) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [asset, onClose])

  // As in TransactionDrillDown, the panel chrome stays mounted and animates;
  // its contents render only while an asset is open, so closing slides out an
  // empty panel for the 200 ms of the transition.
  const config = asset ? getTypeConfig(asset.type) : null
  const isMarketPriced = asset?.valuation_method === 'market_price'
  const isSynced = !!asset && asset.source !== 'manual'
  // A provider-owned asset is read-only, matching the holdings table: synced
  // but not market-priced means the provider, not the user, owns its figures.
  const isProviderOwned = isSynced && !isMarketPriced
  const canWriteHere = canWrite && !isProviderOwned
  const isTesouro = !!asset?.ticker?.startsWith('TD:')
  const hasTicker = !!asset?.ticker && !isTesouro
  // Same subtitle rule as the holdings row: the name when a ticker headlines
  // the panel, otherwise what kind of thing this is.
  const typeLabel = asset
    ? t(
        `assets.type${asset.type
          .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
          .replace(/^./, (c) => c.toUpperCase())}`,
      )
    : ''
  const needsBuys = isMarketPriced && asset?.average_price == null && !asset?.sell_date
  const canSell = (asset?.units ?? 0) > 0

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${
          asset ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-full sm:max-w-xl bg-card shadow-2xl z-50 transform transition-transform duration-200 ease-out flex flex-col ${
          asset ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {asset && config && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <AssetIcon
                  logoUrl={asset.logo_url}
                  Icon={config.icon}
                  colorClass={config.color}
                  bgClass={config.bg}
                  size={20}
                  tile="w-10 h-10"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="text-sm font-semibold text-foreground truncate">
                      {hasTicker ? asset.ticker : asset.name}
                    </h2>
                    {asset.sell_date && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-rose-600 border-rose-200">
                        {t('assets.sold')}
                      </Badge>
                    )}
                    {isProviderOwned && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-sky-600 border-sky-200">
                        {t('assets.synced')}
                      </Badge>
                    )}
                    {needsBuys && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30"
                        title={t('assets.noPriceWarning')}
                      >
                        {t('assets.noPriceBadge')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {hasTicker ? asset.name : isTesouro ? 'Tesouro Direto' : typeLabel}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>

            {/* Two separately labelled actions, so recording a sale is as
                reachable as recording a purchase. Selling needs a position to
                sell: the backend refuses a short (_raise_if_oversell), and
                saying so here beats discovering it as a failed request. */}
            {isMarketPriced && canWriteHere && (
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0">
                <Button
                  size="sm"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  onClick={() => onAddTransaction(asset.id, 'buy')}
                >
                  <Plus size={14} />
                  {t('assets.recordBuy')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  disabled={!canSell}
                  onClick={() => onAddTransaction(asset.id, 'sell')}
                >
                  <Minus size={14} />
                  {t('assets.recordSell')}
                </Button>
              </div>
            )}
            {isMarketPriced && canWriteHere && !canSell && (
              <p className="px-5 pb-3 text-[11px] text-muted-foreground shrink-0">
                {t('assets.nothingToSell')}
              </p>
            )}

            {/* Body */}
            <div className="flex-1 overflow-auto">
              {isMarketPriced ? (
                <>
                  <PositionSummary
                    asset={asset}
                    portfolioTotalPrimary={portfolioTotalPrimary}
                    userCurrency={userCurrency}
                    locale={locale}
                    canWrite={canWriteHere}
                    onRecordBuy={() => onAddTransaction(asset.id, 'buy')}
                  />
                  <BoughtSoldBar
                    txs={txs ?? []}
                    currency={asset.currency}
                    currentValue={asset.current_value}
                    locale={locale}
                  />
                  <AssetDetail
                    assetId={asset.id}
                    currency={asset.currency}
                    locale={locale}
                    dateLocale={dateLocale}
                    purchasePrice={asset.purchase_price}
                    purchaseDate={asset.purchase_date}
                    valuationMethod={asset.valuation_method}
                    canWrite={canWriteHere}
                    chartOnly
                  />
                  <HoldingLedger
                    asset={asset}
                    locale={locale}
                    dateLocale={dateLocale}
                    canWrite={canWriteHere}
                    onAdd={() => onAddTransaction(asset.id, 'buy')}
                    onChanged={onChanged}
                  />
                </>
              ) : (
                <AssetDetail
                  assetId={asset.id}
                  currency={asset.currency}
                  locale={locale}
                  dateLocale={dateLocale}
                  purchasePrice={asset.purchase_price}
                  purchaseDate={asset.purchase_date}
                  valuationMethod={asset.valuation_method}
                  canWrite={canWriteHere}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
