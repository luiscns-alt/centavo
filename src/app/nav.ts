import { ChartColumn, Home, List, Plus, Settings2, type LucideIcon } from 'lucide-react'

export type Tab = 'home' | 'transactions' | 'add' | 'compare' | 'settings'

export const NAV_ITEMS: { id: Exclude<Tab, 'add'>; label: string; Icon: LucideIcon }[] = [
  { id: 'home',         label: 'Início',      Icon: Home },
  { id: 'transactions', label: 'Lançamentos', Icon: List },
  { id: 'compare',      label: 'Análises',    Icon: ChartColumn },
  { id: 'settings',     label: 'Ajustes',     Icon: Settings2 },
]

export const ADD_ITEM = { id: 'add' as const, label: 'Novo lançamento', Icon: Plus }
