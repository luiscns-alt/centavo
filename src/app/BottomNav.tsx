import { ADD_ITEM, NAV_ITEMS, type Tab } from './nav'
import { css, cx } from '../../styled-system/css'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

// Order on mobile: Início · Lançamentos · (+) · Análises · Ajustes
const [home, transactions, compare, settings] = NAV_ITEMS
const slots = [home, transactions, ADD_ITEM, compare, settings]

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className={cx(css({ md: { display: 'none' }, position: 'fixed', bottom: '0', insetX: '0', zIndex: '50', bg: 'surface/90', backdropFilter: '[blur(12px)]', borderTopWidth: '1px', borderColor: 'border' }), 'pb-safe')}>
      <div className={css({ display: 'flex', alignItems: 'center', maxW: '[480px]', mx: 'auto', px: '2' })}>
        {slots.map(({ id, label, Icon }) => {
          if (id === 'add') {
            return (
              <div key={id} className={css({ flex: '1', display: 'flex', justifyContent: 'center' })}>
                <button
                  onClick={() => onChange(id)}
                  aria-label={label}
                  className={cx(css({ w: '12', h: '12', mt: '-1', rounded: '2xl', bg: 'ink', color: 'bg', display: 'flex', alignItems: 'center', justifyContent: 'center', _active: { scale: '[0.95]' }, transition: 'transform' }), 'fab-shadow')}
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
              className={css({ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1', pt: '3', pb: '1' })}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2 : 1.5}
                className={css(isActive ? { color: 'ink' } : { color: 'muted' })}
              />
              <span className={css({ w: '1', h: '1', rounded: 'full', bg: 'ink', transition: 'opacity' }, isActive ? { opacity: '1' } : { opacity: '0' })} />
            </button>
          )
        })}
      </div>
    </nav>
  )
}
