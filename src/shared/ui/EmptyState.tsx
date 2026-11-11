import { Plus } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6 slide-up">
      {/* Ledger lines — a quiet nod to the empty notebook page */}
      <div className="w-14 mb-5 flex flex-col gap-1.5" aria-hidden>
        <span className="h-px bg-border" />
        <span className="h-px bg-border" />
        <span className="h-px bg-border w-2/3" />
      </div>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {description && <p className="text-[13px] text-muted mt-1 max-w-[280px] leading-relaxed">{description}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border bg-surface text-[13px] font-semibold text-ink hover:bg-bg transition-colors"
        >
          <Plus size={15} strokeWidth={2} />
          {actionLabel}
        </button>
      )}
    </div>
  )
}
