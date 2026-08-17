import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { HelpCircle } from 'lucide-react'

import { useAuth } from '@/contexts/auth-context'
import { auth as authApi } from '@/lib/api'

/**
 * Folds planned commitments into computed figures.
 *
 * Shared rather than duplicated per page: the preference governs the
 * dashboard, budgets and reports alike, so a total must never be ambiguous
 * about what it counts on any of them. It is also why the control is a
 * toggle on each page and not a read-only badge — a user looking at a figure
 * they don't recognise should be able to change what feeds it from where
 * they are, not navigate elsewhere to find the switch.
 *
 * Note it never affects balances (an account balance answers "what does the
 * bank hold?") nor what any list contains.
 */
export function IncludePlannedToggle() {
  const { t } = useTranslation()
  const { user, updateUser } = useAuth()
  const queryClient = useQueryClient()
  const includePlanned = user?.preferences?.include_planned ?? false

  const mutation = useMutation({
    // The API replaces the preferences blob wholesale, so the existing keys
    // have to be spread back in or language/currency would be dropped.
    mutationFn: (next: boolean) =>
      authApi.updateMe({
        preferences: { ...(user?.preferences ?? {}), include_planned: next },
      }),
    onSuccess: (updated) => {
      updateUser(updated)
      for (const key of ['dashboard', 'budgets', 'reports', 'accounts']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })

  return (
    <label className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-border bg-card px-2.5 cursor-pointer hover:bg-muted/50 transition-all">
      <input
        type="checkbox"
        checked={includePlanned}
        disabled={mutation.isPending}
        onChange={(e) => mutation.mutate(e.target.checked)}
        className="rounded border-gray-300"
      />
      <span className="text-sm text-foreground whitespace-nowrap">
        {t('dashboard.includePlanned')}
      </span>
      <span
        title={t('dashboard.includePlannedHint')}
        className="inline-flex cursor-help"
        onClick={(e) => e.preventDefault()}
      >
        <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
      </span>
    </label>
  )
}
