import { Home, List, Plus, Settings2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Tab = 'home' | 'transactions' | 'add' | 'settings'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

const tabs: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'home',         label: 'Início',          Icon: Home },
  { id: 'transactions', label: 'Lançamentos',      Icon: List },
  { id: 'add',          label: 'Novo lançamento',  Icon: Plus },
  { id: 'settings',     label: 'Componentes',      Icon: Settings2 },
]

export function SideNav({ active, onChange }: Props) {
  return (
    <nav className="hidden md:flex w-[220px] min-h-svh border-r border-border flex-col bg-surface shrink-0 sticky top-0">
      {/* Logo */}
      <div className="px-6 pt-6 pb-4">
        <span className="text-[17px] font-semibold text-ink">centavo</span>
      </div>

      {/* Nav items */}
      <div className="flex-1 px-3 py-2 flex flex-col gap-0.5">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-label={label}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors w-full text-left',
                isActive
                  ? 'bg-bg text-ink'
                  : 'text-muted hover:text-ink hover:bg-bg',
              ].join(' ')}
            >
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
              {label}
            </button>
          )
        })}
      </div>

      {/* User */}
      <div className="px-5 py-5 border-t border-border flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center text-[10px] font-semibold text-muted shrink-0">
          LC
        </div>
        <span className="text-[13px] text-muted truncate">Luis Carlos</span>
      </div>
    </nav>
  )
}
