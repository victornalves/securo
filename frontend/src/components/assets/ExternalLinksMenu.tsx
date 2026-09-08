import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Asset } from '@/types'
import { externalLinksFor, type ExternalLinkProvider } from '@/lib/asset-detail-utils'

/**
 * Links out to third-party market data for a publicly traded holding.
 *
 * Securo links, it never reads: the URLs are built from the stored ticker, no
 * request leaves for any provider, and nothing a provider returns is parsed or
 * shown here (spec 008 D6).
 *
 * Renders nothing where the ticker cannot identify a public instrument —
 * manual and growth-rule assets, tickerless assets, and Tesouro Direto, whose
 * `TD:<hash>:<maturity>` symbol is Securo-internal. `externalLinksFor` owns
 * that rule; note that it is deliberately *not* the same test as
 * `hasFilterableTicker`, which the transactions tab's filter uses.
 */
const PROVIDER_LABEL: Record<ExternalLinkProvider, string> = {
  yahoo: 'Yahoo Finance',
  tradingview: 'TradingView',
  google: 'Google',
}

export function ExternalLinksMenu({ asset }: { asset: Asset }) {
  const { t } = useTranslation()
  const links = externalLinksFor(asset)

  if (links.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title={t('assets.externalLinksHint')}
        >
          <ExternalLink size={12} />
          {t('assets.externalLinks')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Says plainly that these leave Securo, so the destination is never
            mistaken for one of our screens. */}
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {t('assets.externalLinksHint')}
        </DropdownMenuLabel>
        {links.map((link) => (
          <DropdownMenuItem key={link.provider} asChild>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 cursor-pointer"
            >
              {PROVIDER_LABEL[link.provider]}
              <ExternalLink size={12} className="text-muted-foreground shrink-0" />
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
