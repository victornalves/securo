import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { assets } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { AlertTriangle } from 'lucide-react'
import type { Asset } from '@/types'
import { formatCurrency, assetErrorMessage } from './asset-format'
import { refetchAssetLedgerViews } from '@/lib/asset-queries'

// Records a buy or a sell against an already-existing holding. Opened from the
// holdings table ("+ add buys") and from the drawer's two primary actions,
// which pre-set `initialKind` — so reaching a sale never requires finding the
// type toggle below (spec 008 D3). The toggle stays, for changing direction
// after the fact.
export function AddHoldingTransactionDialog({
  assetId,
  holding,
  initialKind = 'buy',
  locale,
  onClose,
  onChanged,
}: {
  assetId: string | null
  holding: Asset | null
  initialKind?: 'buy' | 'sell'
  locale: string
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [fee, setFee] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    if (assetId) {
      setKind(initialKind)
      setQuantity('')
      setPrice('')
      setFee('')
      setNotes('')
      setDate(new Date().toISOString().slice(0, 10))
    }
  }, [assetId, initialKind])

  const saveMutation = useMutation({
    mutationFn: () =>
      assets.addTransaction(assetId!, {
        kind,
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        fee: fee ? parseFloat(fee) : 0,
        date,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      refetchAssetLedgerViews(queryClient, assetId)
      onChanged()
      onClose()
      toast.success(t('assets.txSaved'))
    },
    onError: (e) => toast.error(assetErrorMessage(e, t('common.error'))),
  })

  const cur = holding?.currency ?? 'USD'
  const heldUnits = holding?.units ?? 0
  const oversell = kind === 'sell' && !!quantity && parseFloat(quantity) > heldUnits
  const canSave = !!quantity && parseFloat(quantity) > 0 && !!price && !oversell && !saveMutation.isPending

  return (
    <Dialog open={!!assetId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('assets.addTransaction')}{holding ? ` · ${holding.ticker || holding.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('assets.txType')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['buy', 'sell'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                  onClick={() => setKind(k)}
                >
                  {k === 'buy' ? t('assets.txBuy') : t('assets.txSell')}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('assets.quantity')}</Label>
              <Input type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('assets.unitPrice')}</Label>
              <Input type="number" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('assets.fee')}</Label>
              <Input type="number" step="any" min="0" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>{t('assets.date')}</Label>
              <DatePickerInput value={date} onChange={setDate} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('transactions.notes')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('assets.txNotesPlaceholder')} />
          </div>
          {oversell && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={13} className="shrink-0" />
              {t('assets.oversellWarning', { available: heldUnits })}
            </p>
          )}
          {quantity && price && parseFloat(quantity) > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">{t('assets.txTotal')}</span>
              <span className="text-sm font-bold tabular-nums text-foreground">
                {formatCurrency(parseFloat(quantity) * parseFloat(price) + (fee ? parseFloat(fee) : 0) * (kind === 'buy' ? 1 : -1), cur, locale)}
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!canSave}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
