import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assets } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { Asset, AssetTransaction } from '@/types'
import { formatCurrency, assetErrorMessage } from './asset-format'
import { refetchAssetLedgerViews } from '@/lib/asset-queries'
import { runningPositions, txTotal } from '@/lib/asset-detail-utils'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'

type KindFilter = 'all' | 'buy' | 'sell'

// The holding's buy/sell ledger, rendered inside the asset detail drawer.
// Not just a list of receipts: each row carries the position it left behind, so
// the ledger reads as the history of the holding. The consolidated figures
// above are recomputed server-side by _recompute.
export function HoldingLedger({
  asset,
  locale,
  dateLocale,
  canWrite,
  onAdd,
  onEdit,
  onChanged,
}: {
  asset: Asset
  locale: string
  dateLocale: string
  canWrite: boolean
  onAdd: () => void
  onEdit: (tx: AssetTransaction) => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const { mask } = usePrivacyMode()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<KindFilter>('all')
  const [deleting, setDeleting] = useState<AssetTransaction | null>(null)

  const { data: txs, isLoading } = useQuery({
    queryKey: ['asset-transactions', asset.id],
    queryFn: () => assets.transactions(asset.id),
  })

  // Memoized so the derivations below actually memoize: `txs ?? []` would hand
  // them a fresh array reference on every render.
  const all = useMemo(() => txs ?? [], [txs])
  // Computed over the whole ledger, never the filtered view: "units held after
  // this trade" is a fact about the position, not about what is on screen.
  const positions = useMemo(() => runningPositions(all), [all])

  const counts = useMemo(
    () => ({
      all: all.length,
      buy: all.filter((tx) => tx.kind === 'buy').length,
      sell: all.filter((tx) => tx.kind === 'sell').length,
    }),
    [all],
  )
  const rows = useMemo(
    () => (filter === 'all' ? all : all.filter((tx) => tx.kind === filter)),
    [all, filter],
  )

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assets.deleteTransaction(id),
    onSuccess: () => {
      refetchAssetLedgerViews(queryClient, asset.id)
      onChanged()
      setDeleting(null)
      toast.success(t('assets.txDeleted'))
    },
    onError: (e) => toast.error(assetErrorMessage(e, t('common.error'))),
  })

  const FILTERS: { key: KindFilter; label: string; count: number }[] = [
    { key: 'all', label: t('assets.filterAll'), count: counts.all },
    { key: 'buy', label: t('assets.txBuy'), count: counts.buy },
    { key: 'sell', label: t('assets.txSell'), count: counts.sell },
  ]

  return (
    <div className="border-t border-border bg-muted/10 px-4 py-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
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

      {/* Direction filter. Client-side is right here — this is one asset's
          ledger, already fetched. The portfolio-wide tab filters server-side. */}
      {counts.all > 0 && (
        <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-muted">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filter === f.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
              <span className="ml-1 tabular-nums text-muted-foreground">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : counts.all === 0 ? (
        <div className="py-3 space-y-2">
          <p className="text-xs text-muted-foreground">{t('assets.noLedgerYet')}</p>
          {canWrite && (
            <Button size="sm" className="h-7 px-2.5 text-xs gap-1" onClick={onAdd}>
              <Plus size={13} />
              {t('assets.recordBuy')}
            </Button>
          )}
        </div>
      ) : rows.length === 0 ? (
        // Filtered to nothing is a different fact from having no trades.
        <p className="text-xs text-muted-foreground py-2">{t('assets.noMatchingTx')}</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border bg-card">
          {rows.map((tx) => (
            <div key={tx.id} className="flex items-start gap-3 px-3 py-2">
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 shrink-0 mt-0.5 ${
                  tx.kind === 'buy'
                    ? 'text-emerald-600 border-emerald-200'
                    : 'text-rose-600 border-rose-200'
                }`}
              >
                {tx.kind === 'buy' ? t('assets.txBuy') : t('assets.txSell')}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {new Date(tx.date + 'T00:00:00').toLocaleDateString(dateLocale)} ·{' '}
                  {mask(`${tx.quantity}`)} × {mask(formatCurrency(tx.price, asset.currency, locale))}
                </p>
                {/* The position this trade left behind — what makes the list a
                    history rather than a pile of receipts. */}
                {positions.has(tx.id) && (
                  <p className="text-[10px] text-muted-foreground/80 tabular-nums">
                    {t('assets.positionAfter', { units: mask(`${positions.get(tx.id)}`) })}
                  </p>
                )}
                {tx.notes && (
                  <p className="text-[10px] text-muted-foreground italic truncate">{tx.notes}</p>
                )}
              </div>
              {/* Fee-inclusive, like the dialog's "Total" and _recompute's
                  cost: a fee raises what a buy cost and lowers what a sell
                  returned. The fee itself is shown below when non-zero. */}
              <div className="text-right shrink-0">
                <span className="block text-xs font-semibold tabular-nums text-foreground">
                  {mask(formatCurrency(txTotal(tx), asset.currency, locale))}
                </span>
                {tx.fee > 0 && (
                  <span className="block text-[10px] text-muted-foreground tabular-nums">
                    {t('assets.txFee')} {mask(formatCurrency(tx.fee, asset.currency, locale))}
                  </span>
                )}
              </div>
              {canWrite && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => onEdit(tx)}
                    className="p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
                    title={t('common.edit')}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => setDeleting(tx)}
                    className="p-1 rounded text-muted-foreground/50 hover:text-rose-600 transition-colors"
                    title={t('common.delete')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Deleting a trade re-derives the holding's average price, so it is
          worth confirming — the same warning the global tab gives. */}
      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('assets.confirmDeleteTxTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('assets.confirmDeleteTx')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
