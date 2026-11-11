import { ArrowRight, ChevronRight } from 'lucide-react'
import { formatBRL, todayISO } from '../../core/db'
import { useAccountBalances, type AccountWithBalance } from './useAccounts'
import { useCardSummaries } from '../credit-cards'
import { useLoanSummaries } from '../loans'
import { groupByBank } from './accountSelection'
import { ACCOUNT_KINDS } from '../../core/ledger/base'
import type { AccountScope } from './AccountFilter'
import { AccountIcon } from './AccountIcon'

const MONTH_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const signedBRL = (c: number) => (c < 0 ? `−${formatBRL(-c)}` : formatBRL(c))

interface Props {
  /** Balances at the end of this day (YYYY-MM-DD) */
  asOf: string
  account: AccountScope
  /** Cards listed under their banks (off on Início, where Cartões has its own block) */
  showCards?: boolean
  /** Balances from the Início summary (skips a second full read of the ledger) */
  balances?: Record<number, number>
  onManage: () => void
  onOpenCard: (id: number) => void
  onOpenLoan: (id: number) => void
}

/**
 * Saldo em contas at the end of `asOf`, grouped by bank: each bank account with
 * its cards underneath (current invoice + available limit). Total = patrimônio.
 */
export function AccountsCard({ asOf, account, showCards = true, balances, onManage, onOpenCard, onOpenLoan }: Props) {
  const { accounts, total, loading } = useAccountBalances(asOf, balances)
  const cards = useCardSummaries()
  const loans = useLoanSummaries()

  // Archived accounts only show while they still hold money (or owe it)
  const visible = accounts.filter(a => !a.archived || a.balance !== 0)
  const groups = groupByBank(visible)
    .filter(g => showCards || g.bank.kind !== 'credit')
    .map(g => (showCards ? g : { ...g, cards: [] }))

  const toggle = (sel: string) => account.setSelection(account.selection === sel ? '' : sel)

  return (
    <section className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl">
      <div className="flex items-baseline justify-between gap-3 px-5 md:px-6 pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">{showCards ? 'Contas e cartões' : 'Contas'}</div>
        <div className="text-[12px] text-muted">{asOf === todayISO() ? 'hoje' : `${Number(asOf.slice(8))} de ${MONTH_LONG[Number(asOf.slice(5, 7)) - 1]}`}</div>
      </div>

      {!loading && visible.length === 0 ? (
        <div className="px-5 md:px-6 py-6 text-center">
          <p className="text-[13px] text-muted m-0">Cadastre seus bancos, cartões e carteiras para ver o saldo de cada um.</p>
          <button onClick={onManage} className="mt-3 h-9 px-4 rounded-full border border-border text-[13px] font-semibold text-ink hover:bg-bg">
            Cadastrar conta
          </button>
        </div>
      ) : (
        <>
          <ul className="m-0 p-0 list-none mt-2 px-2 md:px-3">
            {groups.map(({ bank, cards: bankCards }) => {
              const sel = bankCards.length ? `b:${bank.id}` : `a:${bank.id}`
              const active = account.selection === sel || account.selection === `a:${bank.id}`
              return (
                <li key={bank.id} className={`rounded-xl ${active ? 'bg-bg' : ''}`}>
                  {bank.kind === 'credit'
                    ? <CardRow card={bank} summary={cards?.get(bank.id)} onOpen={() => onOpenCard(bank.id)} />
                    : (
                      <button
                        onClick={() => toggle(sel)}
                        aria-pressed={active}
                        className={`w-full flex items-center gap-3 px-3 h-14 rounded-xl text-left transition-colors ${active ? '' : 'hover:bg-bg/60'}`}
                      >
                        <AccountIcon account={bank} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-[15px] truncate ${active ? 'font-semibold' : 'font-medium'} text-ink`}>{bank.name}</div>
                          <div className="text-[12px] text-muted truncate">
                            {ACCOUNT_KINDS[bank.kind].label}{bank.archived ? ' · arquivada' : ''}
                          </div>
                        </div>
                        <div className={`text-[15px] font-bold nums shrink-0 ${bank.balance < 0 ? 'text-expense' : 'text-ink'}`}>
                          {signedBRL(bank.balance)}
                        </div>
                      </button>
                    )}
                  {bankCards.map(c => (
                    <div key={c.id} className="pl-7">
                      <CardRow card={c} summary={cards?.get(c.id)} onOpen={() => onOpenCard(c.id)} nested />
                    </div>
                  ))}
                </li>
              )
            })}
          </ul>

          {/* Loans and financing: the debt (−outstanding) and the next installment */}
          {loans && loans.length > 0 && (
            <>
              <div className="px-5 md:px-6 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Empréstimos</div>
              <ul className="m-0 p-0 list-none px-2 md:px-3">
                {loans.map(l => (
                  <li key={l.loanId}>
                    <button onClick={() => onOpenLoan(l.loanId)} className="w-full flex items-center gap-3 px-3 h-14 rounded-xl text-left hover:bg-bg/60 transition-colors">
                      <AccountIcon account={l.account} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-ink truncate">{l.account.name}</div>
                        <div className={`text-[12px] truncate nums ${l.next?.status === 'overdue' ? 'text-expense font-semibold' : 'text-muted'}`}>
                          {l.next
                            ? `parcela ${l.next.n}/${l.total} · ${l.next.status === 'overdue' ? 'venceu' : 'vence'} ${Number(l.next.dueDate.slice(8))} ${MONTH_SHORT[Number(l.next.dueDate.slice(5, 7)) - 1]} · ${formatBRL(l.next.total)}`
                            : 'quitado'}
                        </div>
                      </div>
                      <div className="text-[15px] font-bold nums shrink-0 text-expense">{l.outstanding > 0 ? `−${formatBRL(l.outstanding)}` : formatBRL(0)}</div>
                      <ChevronRight size={16} strokeWidth={1.75} className="text-muted shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mx-5 md:mx-6 mt-1 py-3.5 border-t border-border flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink">Patrimônio</span>
            <span className={`text-[17px] font-bold nums ${total < 0 ? 'text-expense' : 'text-ink'}`}>{loading ? '–' : signedBRL(total)}</span>
          </div>
        </>
      )}

      <div className="px-5 md:px-6 pb-4 pt-1 flex justify-end">
        <button onClick={onManage} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink hover:opacity-70">
          Gerenciar contas <ArrowRight size={15} strokeWidth={2} />
        </button>
      </div>
    </section>
  )
}

/** A card under its bank: what's owed on the invoice to pay now, and the limit left */
function CardRow({ card, summary, onOpen, nested = false }: {
  card: AccountWithBalance
  summary?: { invoiceMonth: string; dueDate: string; remaining: number; available: number | null }
  onOpen: () => void
  nested?: boolean
}) {
  const due = summary ? `${Number(summary.dueDate.slice(8))} ${MONTH_SHORT[Number(summary.dueDate.slice(5, 7)) - 1]}` : ''
  return (
    <button
      onClick={onOpen}
      className={`w-full flex items-center gap-3 px-3 ${nested ? 'h-12' : 'h-14'} rounded-xl text-left hover:bg-bg/60 transition-colors`}
    >
      <AccountIcon account={card} size={nested ? 28 : 36} />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink truncate">{card.name}</div>
        <div className="text-[12px] text-muted truncate nums">
          {summary ? `Fatura vence ${due}` : 'Cartão de crédito'}
          {summary?.available != null && ` · disp. ${signedBRL(summary.available)}`}
        </div>
      </div>
      <div className="text-[14px] font-bold nums shrink-0 text-ink">
        {summary ? formatBRL(Math.max(summary.remaining, 0)) : '–'}
      </div>
      <ChevronRight size={16} strokeWidth={1.75} className="text-muted shrink-0" />
    </button>
  )
}
