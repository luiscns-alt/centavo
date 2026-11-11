import type { ReactNode } from 'react'
import { css } from '../../../styled-system/css'
import { MonthSelector, type MonthNav } from './MonthSelector'

const desktop = css({
  display: { base: 'none', md: 'flex' }, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
  columnGap: '4', rowGap: '3', mb: '6',
})
const titleRow = css({ display: 'flex', alignItems: 'center', gap: '3', minW: '0' })
const titleText = css({ fontSize: '22', fontWeight: 'semibold', letterSpacing: 'title', color: 'ink', m: '0', whiteSpace: 'nowrap' })
const mobile = css({ display: { base: 'block', md: 'none' } })
const mobileFilter = css({ display: 'flex', justifyContent: 'center', pb: '1', _empty: { display: 'none' } })

/** Title + month selector + an optional filter (e.g. the account filter), laid out for desktop and phone */
export function ScreenHeader({ title, nav, filter }: { title: string; nav: MonthNav; filter?: ReactNode }) {
  return (
    <>
      <div className={desktop}>
        <div className={titleRow}>
          <h1 className={titleText}>{title}</h1>
          {filter}
        </div>
        <div className={css({ flexShrink: '0' })}><MonthSelector {...nav} align="start" /></div>
      </div>
      <div className={mobile}>
        <MonthSelector {...nav} />
        <div className={mobileFilter}>{filter}</div>
      </div>
    </>
  )
}
