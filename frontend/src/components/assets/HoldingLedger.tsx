import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assets } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2 } from 'lucide-react'
import type { Asset } from '@/types'
import { formatCurrency, assetErrorMessage } from './asset-format'
import { refetchAssetLedgerViews } from '@/lib/asset-queries'

// Inline buy/sell ledger shown when a holding row is expanded (the
// "Lançamentos" of the reference). Lists the holding's transactions and
// offers a one-tap add — the consolidated row above is recomputed server-side.
export function HoldingLedger({
  asset,
  locale,
  dateLocale,
  mask,
  canWrite,
  onAdd,
  onChanged,
}: {
  asset: Asset
  locale: string
  dateLocale: string
  mask: (v: string) => string
  canWrite: boolean
  onAdd: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: txs, isLoading } = useQuery({
    queryKey: ['asset-transactions', asset.id],
    queryFn: () => assets.transactions(asset.id),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assets.deleteTransaction(id),
    onSuccess: () => {
      refetchAssetLedgerViews(queryClient, asset.id)
      onChanged()
      toast.success(t('assets.txDeleted'))
    },
    onError: (e) => toast.error(assetErrorMessage(e, t('common.error'))),
  })

  return (
    <div className="border-t border-border bg-muted/10 px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t('assets.ledgerTitle')}
        </p>
        {canWrite && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={onAdd}>
            <Plus size={13} />
            {t('assets.addTransaction')}
          </Button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : (txs ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{t('assets.noLedgerYet')}</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border bg-card">
          {(txs ?? []).map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 px-3 py-2">
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 shrink-0 ${tx.kind === 'buy' ? 'text-emerald-600 border-emerald-200' : 'text-rose-600 border-rose-200'}`}
              >
                {tx.kind === 'buy' ? t('assets.txBuy') : t('assets.txSell')}
              </Badge>
              <span className="text-[11px] text-muted-foreground tabular-nums flex-1">
                {new Date(tx.date + 'T00:00:00').toLocaleDateString(dateLocale)} ·{' '}
                {mask(`${tx.quantity}`)} × {mask(formatCurrency(tx.price, asset.currency, locale))}
              </span>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {mask(formatCurrency(tx.quantity * tx.price, asset.currency, locale))}
              </span>
              {canWrite && (
                <button
                  onClick={() => deleteMutation.mutate(tx.id)}
                  disabled={deleteMutation.isPending}
                  className="p-1 rounded text-muted-foreground/50 hover:text-rose-600 transition-colors"
                  title={t('common.delete')}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
