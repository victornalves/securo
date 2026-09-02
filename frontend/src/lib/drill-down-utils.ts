import type { ProjectedTransaction, Transaction } from '@/types'

/**
 * Pure logic behind the dashboard's drill-down drawer.
 *
 * Lives outside the component so it can be tested: the drawer merges stored
 * transactions with virtual recurring projections, and the question that
 * matters — does the merged list add up to the figure the user clicked? — is
 * arithmetic, not rendering. See planning/006-planned-transactions-in-dashboard-drill-down.
 */

export type DrillDownFilter = {
  title: string
  category_id?: string
  uncategorized?: boolean
  account_id?: string
  // Scope to a set of accounts (e.g. the active collection's accounts).
  account_ids?: string[]
  type?: 'credit' | 'debit'
  from?: string
  to?: string
}

/**
 * What kind of thing a row is.
 *
 * `planned` and `projected` are both "hasn't happened yet", but they are not
 * the same object: a planned row is stored and editable, a projection is a
 * recurrence rule's future occurrence that has no row yet. They never overlap
 * — `_get_recurring_projections` enumerates from `RecurringTransaction.next_occurrence`
 * forward and `generate_pending` advances past everything it materializes — so
 * the merge must not try to dedupe them.
 */
export type DrillDownKind = 'realized' | 'planned' | 'projected'

export type DisplayItem = {
  key: string
  description: string
  date: string
  type: 'debit' | 'credit'
  amount: number
  amountPrimary: number | null
  currency: string
  categoryIcon: string | null
  categoryName: string | null
  categoryColor: string | null
  kind: DrillDownKind
  attachmentCount: number
  transaction: Transaction | null
}

export function buildDrillDownItems({
  transactions,
  projections,
  filter,
}: {
  transactions: Transaction[]
  projections: ProjectedTransaction[]
  filter: DrillDownFilter | null
}): DisplayItem[] {
  const items: DisplayItem[] = []

  for (const tx of transactions) {
    items.push({
      key: tx.id,
      description: tx.description,
      date: tx.date,
      type: tx.type as 'debit' | 'credit',
      amount: Number(tx.amount),
      amountPrimary: tx.amount_primary != null ? Number(tx.amount_primary) : null,
      currency: tx.currency,
      categoryIcon: tx.category?.icon ?? null,
      categoryName: tx.category?.name ?? null,
      categoryColor: tx.category?.color ?? null,
      kind: tx.status === 'planned' ? 'planned' : 'realized',
      attachmentCount: tx.attachment_count ?? 0,
      transaction: tx,
    })
  }

  for (const pt of projections) {
    // Filter projected txs by drill-down criteria
    if (filter?.type && pt.type !== filter.type) continue
    if (filter?.category_id && String(pt.category_id) !== filter.category_id) continue
    if (filter?.uncategorized && pt.category_id != null) continue
    if (filter?.from && pt.date < filter.from) continue
    if (filter?.to && pt.date > filter.to) continue

    items.push({
      key: `proj-${pt.recurring_id}-${pt.date}`,
      description: pt.description,
      date: pt.date,
      type: pt.type,
      amount: pt.amount,
      amountPrimary: pt.amount_primary ?? null,
      currency: pt.currency,
      categoryIcon: pt.category_icon,
      categoryName: pt.category_name,
      categoryColor: pt.category_color ?? null,
      kind: 'projected',
      attachmentCount: 0,
      transaction: null,
    })
  }

  items.sort((a, b) => a.date.localeCompare(b.date))
  return items
}

/**
 * Sum in the user's primary currency. For foreign-currency rows we need
 * amount_primary; if it's missing we can't convert, so skip the row instead
 * of adding a raw foreign amount as if it were primary. This matches how
 * get_summary computes monthly_*_primary on the backend.
 */
function primaryValue(item: DisplayItem, userCurrency: string): number | null {
  if (item.currency === userCurrency) return Math.abs(item.amount)
  if (item.amountPrimary != null) return Math.abs(item.amountPrimary)
  return null
}

/**
 * One total, covering every kind — it is what must equal the dashboard figure
 * the drawer was opened from.
 *
 * `plannedCount` / `plannedTotal` describe the stored planned rows only.
 * Projections are deliberately excluded: the footer line says how much of the
 * total is commitments the user recorded, and a projection is not one.
 */
export function summarizeDrillDown(
  items: DisplayItem[],
  userCurrency: string,
): { absTotal: number; plannedCount: number; plannedTotal: number } {
  let absTotal = 0
  let plannedCount = 0
  let plannedTotal = 0

  for (const item of items) {
    const value = primaryValue(item, userCurrency)
    if (value == null) continue
    absTotal += value
    if (item.kind === 'planned') {
      plannedCount += 1
      plannedTotal += value
    }
  }

  return { absTotal, plannedCount, plannedTotal }
}
