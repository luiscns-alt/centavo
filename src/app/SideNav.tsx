import { ADD_ITEM, NAV_ITEMS, type Tab } from './nav'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export function SideNav({ active, onChange }: Props) {
  const AddIcon = ADD_ITEM.Icon
  return (
    <nav className="hidden md:flex w-[232px] h-svh border-r border-border flex-col bg-surface shrink-0 sticky top-0">
      {/* Logo */}
      <div className="px-6 pt-7 pb-6">
        <span className="text-[17px] font-semibold tracking-[-.01em] text-ink">centavo</span>
      </div>

      {/* Primary action */}
      <div className="px-4 pb-4">
        <button
          onClick={() => onChange('add')}
          aria-current={active === 'add' ? 'page' : undefined}
          title="Atalho: N"
          className="group w-full flex items-center gap-2.5 h-10 pl-3.5 pr-2.5 rounded-xl bg-ink text-bg text-[14px] font-semibold transition-opacity hover:opacity-90"
        >
          <AddIcon size={16} strokeWidth={2.25} />
          <span className="flex-1 text-left whitespace-nowrap">{ADD_ITEM.label}</span>
        </button>
      </div>

      {/* Nav items */}
      <div className="flex-1 px-4 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'relative flex items-center gap-3 h-10 px-3 rounded-xl text-[14px] transition-colors w-full text-left',
                isActive
                  ? 'bg-bg text-ink font-semibold'
                  : 'text-muted font-medium hover:text-ink hover:bg-bg/60',
              ].join(' ')}
            >
              <Icon size={17} strokeWidth={isActive ? 2 : 1.6} />
              {label}
            </button>
          )
        })}
      </div>

      {/* User */}
      <div className="mx-4 mb-4 px-3 py-3 rounded-xl flex items-center gap-3 border border-border">
        <div className="w-8 h-8 rounded-full bg-bg border border-border flex items-center justify-center text-[11px] font-semibold text-ink shrink-0">
          LC
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink truncate">Luis Carlos</div>
          <div className="text-[11px] text-muted truncate">Dados só neste aparelho</div>
        </div>
      </div>
    </nav>
  )
}
