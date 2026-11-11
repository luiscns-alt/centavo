export function MobileHeader({ title = 'centavo' }: { title?: string }) {
  return (
    <div className="md:hidden flex justify-between items-center px-5 pt-5 pb-1">
      <span className="text-[17px] font-semibold tracking-[-.01em] text-ink">{title}</span>
      <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-[11px] font-semibold text-ink">
        LC
      </div>
    </div>
  )
}
