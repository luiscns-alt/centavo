import { ADD_ITEM, NAV_ITEMS, type Tab } from './nav'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

// Order on mobile: Início · Lançamentos · (+) · Análises · Ajustes
const [home, transactions, compare, settings] = NAV_ITEMS
const slots = [home, transactions, ADD_ITEM, compare, settings]

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface/90 backdrop-blur-md border-t border-border pb-safe">
      <div className="flex items-center max-w-[480px] mx-auto px-2">
        {slots.map(({ id, label, Icon }) => {
          if (id === 'add') {
            return (
              <div key={id} className="flex-1 flex justify-center">
                <button
                  onClick={() => onChange(id)}
                  aria-label={label}
                  className="w-12 h-12 -mt-1 rounded-2xl bg-ink text-bg flex items-center justify-center fab-shadow active:scale-95 transition-transform"
                >
                  <Icon size={22} strokeWidth={2.25} />
                </button>
              </div>
            )
          }
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center gap-1 pt-3 pb-1"
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2 : 1.5}
                className={isActive ? 'text-ink' : 'text-muted'}
              />
              <span className={`w-1 h-1 rounded-full bg-ink transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`} />
            </button>
          )
        })}
      </div>
    </nav>
  )
}
