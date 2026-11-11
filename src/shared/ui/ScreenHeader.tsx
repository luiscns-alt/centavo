import type { ReactNode } from 'react'
import { MonthSelector, type MonthNav } from './MonthSelector'

/** Title + month selector + an optional filter (e.g. the account filter), laid out for desktop and phone */
export function ScreenHeader({ title, nav, filter }: { title: string; nav: MonthNav; filter?: ReactNode }) {
  return (
    <>
      <div className="hidden md:flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-.01em] text-ink m-0 whitespace-nowrap">{title}</h1>
          {filter}
        </div>
        <div className="shrink-0"><MonthSelector {...nav} align="start" /></div>
      </div>
      <div className="md:hidden">
        <MonthSelector {...nav} />
        <div className="flex justify-center empty:hidden pb-1">
          {filter}
        </div>
      </div>
    </>
  )
}
