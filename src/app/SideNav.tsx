import { ADD_ITEM, NAV_ITEMS, type Tab } from './nav'
import { css, cx } from '../../styled-system/css'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export function SideNav({ active, onChange }: Props) {
  const AddIcon = ADD_ITEM.Icon
  return (
    <nav className={css({ display: 'none', md: { display: 'flex' }, w: '[232px]', h: '[calc(100svh - var(--safe-top))]', pb: '[var(--safe-bottom)]', borderRightWidth: '1px', borderColor: 'border', flexDirection: 'column', bg: 'surface', flexShrink: '0', position: 'sticky', top: '0' })}>
      {/* Logo */}
      <div className={css({ px: '6', pt: '7', pb: '6' })}>
        <span className={css({ fontSize: '17', fontWeight: 'semibold', letterSpacing: 'title', color: 'ink' })}>centavo</span>
      </div>

      {/* Primary action */}
      <div className={css({ px: '4', pb: '4' })}>
        <button
          onClick={() => onChange('add')}
          aria-current={active === 'add' ? 'page' : undefined}
          title="Atalho: N"
          className={cx(css({ w: 'full', display: 'flex', alignItems: 'center', gap: '2.5', h: '10', pl: '3.5', pr: '2.5', rounded: 'xl', bg: 'ink', color: 'bg', fontSize: '14', fontWeight: 'semibold', transition: 'opacity', _hover: { opacity: '0.9' } }), 'group')}
        >
          <AddIcon size={16} strokeWidth={2.25} />
          <span className={css({ flex: '1', textAlign: 'left', whiteSpace: 'nowrap' })}>{ADD_ITEM.label}</span>
        </button>
      </div>

      {/* Nav items */}
      <div className={css({ flex: '1', px: '4', display: 'flex', flexDirection: 'column', gap: '0.5' })}>
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={css({ position: 'relative', display: 'flex', alignItems: 'center', gap: '3', h: '10', px: '3', rounded: 'xl', fontSize: '14', transition: 'colors', w: 'full', textAlign: 'left' }, isActive ? { bg: 'bg', color: 'ink', fontWeight: 'semibold' } : { color: 'muted', fontWeight: 'medium', _hover: { color: 'ink', bg: 'bg/60' } })}
            >
              <Icon size={17} strokeWidth={isActive ? 2 : 1.6} />
              {label}
            </button>
          )
        })}
      </div>

      {/* User */}
      <div className={css({ mx: '4', mb: '4', px: '3', py: '3', rounded: 'xl', display: 'flex', alignItems: 'center', gap: '3', borderWidth: '1px', borderColor: 'border' })}>
        <div className={css({ w: '8', h: '8', rounded: 'full', bg: 'bg', borderWidth: '1px', borderColor: 'border', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11', fontWeight: 'semibold', color: 'ink', flexShrink: '0' })}>
          LC
        </div>
        <div className={css({ minW: '0' })}>
          <div className={css({ fontSize: '13', fontWeight: 'semibold', color: 'ink', truncate: true })}>Luis Carlos</div>
          <div className={css({ fontSize: '11', color: 'muted', truncate: true })}>Dados só neste aparelho</div>
        </div>
      </div>
    </nav>
  )
}
