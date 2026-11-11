import type { ReactNode } from 'react'

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-1">
      <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">{children}</div>
      {right && <div className="text-[12px] text-muted nums">{right}</div>}
    </div>
  )
}
