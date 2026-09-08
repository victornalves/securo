/**
 * Formatting and error helpers shared by the /assets page and the asset
 * detail drawer. Extracted from pages/assets.tsx (planning/008) so the drawer
 * and the page use one implementation rather than two.
 */

export function formatCurrency(value: number, currency = 'USD', locale = 'en-US') {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'USD' }).format(value)
  } catch {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(value)
  }
}

// Compact relative-time formatter ("2h ago" / "há 2h"). Used for the price
// preview "last updated" hint. Intl.RelativeTimeFormat handles the locale
// grammar so we don't hand-roll plurals. Falls back to absolute date only
// when the input is missing — otherwise always returns a relative string.
export function formatRelativeTime(dateInput: string | null | undefined, locale: string): string | null {
  if (!dateInput) return null
  const then = new Date(dateInput).getTime()
  if (Number.isNaN(then)) return null
  const diffSec = (then - Date.now()) / 1000
  const absSec = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (absSec < 60) return rtf.format(Math.round(diffSec), 'second')
  if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  return rtf.format(Math.round(diffSec / 86400), 'day')
}

// Surface the backend's actual error message (FastAPI puts it in
// response.data.detail) instead of a generic toast. Makes failures
// diagnosable — e.g. the oversell guard message, or a "Not Found" when a
// transaction endpoint is missing because the backend is older than the
// frontend (issue #315) — rather than a cryptic "Error".
export function assetErrorMessage(e: unknown, fallback: string): string {
  const resp = (e as { response?: { data?: { detail?: unknown }; status?: number } })?.response
  const detail = resp?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  return resp?.status ? `${fallback} (${resp.status})` : fallback
}
