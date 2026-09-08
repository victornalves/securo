/**
 * Asset type → icon and palette. Its own module because eslint's
 * react-refresh rule wants constants shared between components to live
 * outside a component file. Extracted from pages/assets.tsx (planning/008).
 */
import {
  Home,
  Car,
  Gem,
  TrendingUp,
  Package,
  LineChart,
  Layers,
  Bitcoin,
  PieChart,
} from 'lucide-react'

export const ASSET_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  real_estate: { icon: Home, color: 'text-blue-600', bg: 'bg-blue-100' },
  vehicle: { icon: Car, color: 'text-violet-600', bg: 'bg-violet-100' },
  valuable: { icon: Gem, color: 'text-amber-600', bg: 'bg-amber-100' },
  investment: { icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  stock: { icon: LineChart, color: 'text-sky-600', bg: 'bg-sky-100' },
  etf: { icon: Layers, color: 'text-teal-600', bg: 'bg-teal-100' },
  crypto: { icon: Bitcoin, color: 'text-orange-600', bg: 'bg-orange-100' },
  fund: { icon: PieChart, color: 'text-indigo-600', bg: 'bg-indigo-100' },
  other: { icon: Package, color: 'text-slate-600', bg: 'bg-slate-100' },
}

export function getTypeConfig(type: string) {
  return ASSET_TYPE_CONFIG[type] ?? ASSET_TYPE_CONFIG['other']
}
