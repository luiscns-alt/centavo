import { ChevronRight } from 'lucide-react'
import { useCardInsights } from './useCardInsights'
import type { CardInsights } from './cardInsights'
import type { InvoiceStatus } from './invoice'
import { MonthBarChart, TooltipRow } from '../../shared/charts/MonthBarChart'
import { Swatch } from '../../shared/charts/Swatch'
import { AccountIcon } from '../accounts'
import { MONTH_LONG, MONTH_SHORT } from '../../shared/utils/dates'
import { formatBRL } from '../../shared/utils/money'

interface Props {
  year: number
  month: number
  period: number
  accountIds: number[] | null
  onOpenCard: (id: number) => void
}

const mShort = (key: string) => MONTH_SHORT[Number(key.slice(5)) - 1]
const mLong = (key: string) => `${MONTH_LONG[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`
const pct = (share: number) => `${Math.round(share * 100)}%`

const STATUS: Record<InvoiceStatus, string> = {
  open: 'aberta', closed: 'fechada', partial: 'paga em parte', paid: 'paga', overdue: 'vencida', future: 'futura', empty: 'sem gastos',
}

/**
 * Comparativo → Cartões de crédito. Rendered only when a card is in scope (the hook returns
 * null otherwise — no empty state, as agreed). Reserves its height while loading.
 */
export function CardInsightsSection({ year, month, period, accountIds, onOpenCard }: Props) {
  const data = useCardInsights(year, month, period, accountIds)
  if (data === null) return null
  if (data === undefined) return <div className="mt-10 h-[720px]" aria-hidden />

  return (
    <div className="mt-10 slide-up">
      <h2 className="px-5 md:px-1 m-0 mb-1 text-[17px] font-semibold text-ink">Cartões de crédito</h2>
      <p className="px-5 md:px-1 m-0 mb-4 text-[13px] text-muted">Quanto os cartões pesam nas suas saídas e o que ainda falta pagar.</p>
      <CardShareBlock data={data} period={period} />
      <OwedBlock data={data} />
      <CardsBlock data={data} onOpenCard={onOpenCard} />
    </div>
  )
}

/** Block 1 — stacked columns: each card's invoice (hatched, split by hairlines) + other methods (tint) */
function CardShareBlock({ data, period }: { data: CardInsights; period: number }) {
  const multi = data.cards.length > 1
  const nameOf = (id: number) => data.cards.find(c => c.id === id)?.name ?? 'Cartão'
  const lastWithSpend = [...data.monthly].reverse().find(m => m.expense > 0)
  const lastIndex = lastWithSpend ? data.monthly.indexOf(lastWithSpend) : -1
  const anyCard = data.monthly.some(m => m.card > 0)

  return (
    <section className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl px-4 md:px-6 pt-5 pb-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Peso do cartão nas saídas</div>
          <p className="m-0 mt-1 text-[14px] text-ink">
            {lastWithSpend
              ? <>Em {MONTH_LONG[Number(lastWithSpend.month.slice(5)) - 1]}, <span className="font-bold nums">{pct(lastWithSpend.cardShare)}</span> das saídas foram no cartão.</>
              : 'Sem saídas neste período.'}
          </p>
        </div>
        <div className="flex items-center gap-4 text-[12px] font-medium text-ink pt-0.5">
          <span className="inline-flex items-center gap-1.5"><Swatch tone="expense" />Cartão{multi ? ' (por cartão)' : ''}</span>
          <span className="inline-flex items-center gap-1.5"><Swatch tone="expense-tint" />Outras formas</span>
        </div>
      </div>

      <div className="mt-6">
        {!anyCard && (
          <p className="m-0 mb-2 text-[12px] text-muted text-center">Nenhuma compra no cartão nos últimos {period} meses.</p>
        )}
        <MonthBarChart
          title={`Saídas por mês divididas entre cartão e outras formas, últimos ${period} meses`}
          height={220}
          groups={data.monthly.map(m => ({
            key: m.month,
            label: mShort(m.month),
            stacked: true,
            bars: [
              ...m.byCard.map(b => ({ value: b.amount, tone: 'expense' as const, hatched: true })),
              { value: m.other, tone: 'expense' as const, tint: true },
            ],
            ariaLabel: `${mLong(m.month)}: cartão ${formatBRL(m.card)}, outras formas ${formatBRL(m.other)}, ${pct(m.cardShare)} no cartão`,
          }))}
          callout={lastIndex >= 0 && lastWithSpend!.card > 0 ? { index: lastIndex, text: pct(lastWithSpend!.cardShare) } : undefined}
          renderTooltip={i => {
            const m = data.monthly[i]
            return (
              <>
                <div className="font-semibold text-ink mb-1 capitalize">{mLong(m.month)}</div>
                {multi
                  ? m.byCard.filter(b => b.amount > 0).map(b => (
                    <TooltipRow key={b.cardId} swatch={<Swatch tone="expense" />} label={nameOf(b.cardId)} value={formatBRL(b.amount)} />
                  ))
                  : <TooltipRow swatch={<Swatch tone="expense" />} label="Cartão" value={formatBRL(m.card)} />}
                <TooltipRow swatch={<Swatch tone="expense-tint" />} label="Outras" value={formatBRL(m.other)} />
                <div className="h-px bg-border my-1" />
                <TooltipRow label="No cartão" value={m.expense > 0 ? pct(m.cardShare) : '—'} strong />
              </>
            )
          }}
        />
      </div>

      {/* Table view — required: the tint alone is below 3:1 against the surface */}
      <details className="mt-1 border-t border-border">
        <summary className="py-3 text-[13px] font-semibold text-ink cursor-pointer select-none">Ver valores</summary>
        <div className="overflow-x-auto pb-2">
          <table className="w-full text-[13px] nums border-collapse">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">
                <th scope="col" className="text-left font-semibold py-2 pr-2">Mês</th>
                <th scope="col" className="text-right font-semibold py-2 px-1.5">Cartão</th>
                <th scope="col" className="text-right font-semibold py-2 px-1.5">Outras</th>
                <th scope="col" className="text-right font-semibold py-2 pl-1.5">%</th>
              </tr>
            </thead>
            <tbody>
              {[...data.monthly].reverse().map(m => (
                <tr key={m.month} className="border-t border-border">
                  <th scope="row" className="text-left font-medium text-ink py-2 pr-2 capitalize whitespace-nowrap">
                    {mShort(m.month)} <span className="text-muted font-normal">{m.month.slice(2, 4)}</span>
                  </th>
                  <td className="text-right text-ink py-2 px-1.5 whitespace-nowrap">{formatBRL(m.card)}</td>
                  <td className="text-right text-ink py-2 px-1.5 whitespace-nowrap">{formatBRL(m.other)}</td>
                  <td className="text-right font-semibold text-ink py-2 pl-1.5">{m.expense > 0 ? pct(m.cardShare) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

/** Block 2 — everything still owed, summed across cards per invoice */
function OwedBlock({ data }: { data: CardInsights }) {
  const { total, invoices } = data.owed
  const multi = data.cards.length > 1
  const nameOf = (id: number) => data.cards.find(c => c.id === id)?.name ?? 'Cartão'

  return (
    <section className="mx-5 md:mx-0 mt-4 bg-surface border border-border rounded-2xl px-4 md:px-6 pt-5 pb-3">
      <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Faturas a pagar</div>
      {invoices.length === 0 ? (
        <p className="m-0 mt-1 mb-3 text-[14px] text-ink">Tudo pago — nenhuma fatura em aberto.</p>
      ) : (
        <>
          <div className="mt-1 text-[22px] font-bold nums text-ink leading-tight">{formatBRL(total)}</div>
          <p className="m-0 mt-0.5 text-[12px] text-muted">
            em {invoices.length} {invoices.length === 1 ? 'fatura' : 'faturas'}
            {multi ? `, somando ${data.cards.length} cartões` : ''} — inclui parcelas já lançadas para os próximos meses
          </p>
          <div className="mt-5">
            <MonthBarChart
              title="Valor a pagar por fatura"
              height={180}
              groups={invoices.map(o => ({
                key: o.invoiceMonth,
                label: mShort(o.invoiceMonth),
                bars: [{ value: o.remaining, tone: 'expense' as const, hatched: true }],
                ariaLabel: `Fatura de ${mLong(o.invoiceMonth)}: ${formatBRL(o.remaining)} a pagar${o.overdue ? ', vencida' : ''}`,
              }))}
              renderTooltip={i => {
                const o = invoices[i]
                return (
                  <>
                    <div className="font-semibold text-ink mb-1 capitalize">Fatura de {mLong(o.invoiceMonth)}</div>
                    {multi && o.byCard.map(b => <TooltipRow key={b.cardId} label={nameOf(b.cardId)} value={formatBRL(b.remaining)} />)}
                    {multi && <div className="h-px bg-border my-1" />}
                    <TooltipRow label="A pagar" value={formatBRL(o.remaining)} strong />
                    {o.overdue && <div className="mt-1 text-[11px] font-semibold text-expense">Vencida</div>}
                  </>
                )
              }}
            />
          </div>
        </>
      )}
    </section>
  )
}

/** Block 3 — one horizontal bar per card, its length = the invoice to pay now */
function CardsBlock({ data, onOpenCard }: { data: CardInsights; onOpenCard: (id: number) => void }) {
  const max = Math.max(1, ...data.cards.map(c => c.total))
  return (
    <section className="mx-5 md:mx-0 mt-4 bg-surface border border-border rounded-2xl pt-5 pb-2">
      <div className="px-5 md:px-6 text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-1">Seus cartões · fatura a pagar</div>
      <ul className="m-0 p-0 list-none">
        {data.cards.map(c => {
          const share = c.total / max
          const due = `${Number(c.dueDate.slice(8))} ${MONTH_SHORT[Number(c.dueDate.slice(5, 7)) - 1]}`
          return (
            <li key={c.id}>
              <button onClick={() => onOpenCard(c.id)} className="w-full px-5 md:px-6 py-3 text-left hover:bg-bg/60 transition-colors">
                <div className="flex items-center gap-3">
                  <AccountIcon account={c} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-ink truncate">{c.name}</div>
                    <div className={`text-[12px] truncate ${c.status === 'overdue' ? 'text-expense font-semibold' : 'text-muted'}`}>
                      vence {due} · {STATUS[c.status]}
                      {c.status === 'partial' && ` · falta ${formatBRL(c.remaining)}`}
                    </div>
                  </div>
                  <div className="text-[15px] font-bold nums text-ink shrink-0">{formatBRL(c.total)}</div>
                  <ChevronRight size={16} strokeWidth={1.75} className="text-muted shrink-0" />
                </div>
                <div className="mt-2 ml-11 h-2.5 rounded-full bg-border/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bar-grow"
                    style={{
                      width: c.total > 0 ? `${Math.max(share * 100, 1.5)}%` : 0,
                      background: 'repeating-linear-gradient(45deg, var(--color-expense) 0 3px, color-mix(in srgb, var(--color-expense) 45%, var(--color-surface)) 3px 4.6px)',
                      opacity: c.status === 'paid' ? 0.4 : 1,
                    }}
                  />
                </div>
                {c.available !== null && (
                  <div className="mt-1 ml-11 text-[11px] text-muted nums">
                    limite disponível {c.available < 0 ? '−' : ''}{formatBRL(Math.abs(c.available))}
                  </div>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
