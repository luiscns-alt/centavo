import { Home, List, Plus, Settings2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Tab = 'home' | 'transactions' | 'add' | 'settings'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

const tabs: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'home',         label: 'Início',      Icon: Home },
  { id: 'transactions', label: 'Lançamentos', Icon: List },
  { id: 'add',          label: 'Adicionar',   Icon: Plus },
  { id: 'settings',     label: 'Ajustes',     Icon: Settings2 },
]

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-border z-50">
      <div className="flex max-w-[480px] mx-auto">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex-1 flex flex-col items-center gap-0.5 pt-3 pb-5 transition-colors"
            aria-label={label}
          >
            <Icon
              size={22}
              strokeWidth={active === id ? 2 : 1.5}
              className={active === id ? 'text-ink' : 'text-muted'}
            />
            <span className={`w-1 h-1 rounded-full transition-opacity ${
              active === id ? 'bg-ink opacity-100' : 'opacity-0'
            }`} />
          </button>
        ))}
      </div>
    </nav>
  )
}
