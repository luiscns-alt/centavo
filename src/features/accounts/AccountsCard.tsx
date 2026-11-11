import { ArrowRight, ChevronRight } from 'lucide-react'
import { useAccountBalances, type AccountWithBalance } from './useAccounts'
import { useCardSummaries } from '../credit-cards'
import { useLoanSummaries } from '../loans'
import { groupByBank } from './accountSelection'
import type { AccountScope } from './AccountFilter'
import { AccountIcon } from './AccountIcon'
import { ACCOUNT_KINDS } from '../../core/constants/domain'
import { todayISO, MONTH_SHORT, formatDayMonth, formatMonthName } from '../../shared/utils/dates'
import { formatBRL, formatBalance } from '../../shared/utils/money'
import { css, cx } from '../../../styled-system/css'
import { nums } from '../../shared/ui/atoms'



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
    <section className={css({ mx: '5', md: { mx: '0' }, bg: 'surface', borderWidth: '1px', borderColor: 'border', rounded: '2xl' })}>
      <div className={css({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3', px: '5', md: { px: '6' }, pt: '5' })}>
        <div className={css({ fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>{showCards ? 'Contas e cartões' : 'Contas'}</div>
        <div className={css({ fontSize: '12', color: 'muted' })}>{asOf === todayISO() ? 'hoje' : `${Number(asOf.slice(8))} de ${formatMonthName(asOf)}`}</div>
      </div>

      {!loading && visible.length === 0 ? (
        <div className={css({ px: '5', md: { px: '6' }, py: '6', textAlign: 'center' })}>
          <p className={css({ fontSize: '13', color: 'muted', m: '0' })}>Cadastre seus bancos, cartões e carteiras para ver o saldo de cada um.</p>
          <button onClick={onManage} className={css({ mt: '3', h: '9', px: '4', rounded: 'full', borderWidth: '1px', borderColor: 'border', fontSize: '13', fontWeight: 'semibold', color: 'ink', _hover: { bg: 'bg' } })}>
            Cadastrar conta
          </button>
        </div>
      ) : (
        <>
          <ul className={css({ m: '0', p: '0', listStyle: 'none', mt: '2', px: '2', md: { px: '3' } })}>
            {groups.map(({ bank, cards: bankCards }) => {
              const sel = bankCards.length ? `b:${bank.id}` : `a:${bank.id}`
              const active = account.selection === sel || account.selection === `a:${bank.id}`
              return (
                <li key={bank.id} className={css({ rounded: 'xl' }, active ? { bg: 'bg' } : {})}>
                  {bank.kind === 'credit'
                    ? <CardRow card={bank} summary={cards?.get(bank.id)} onOpen={() => onOpenCard(bank.id)} />
                    : (
                      <button
                        onClick={() => toggle(sel)}
                        aria-pressed={active}
                        className={css({ w: 'full', display: 'flex', alignItems: 'center', gap: '3', px: '3', h: '14', rounded: 'xl', textAlign: 'left', transition: 'colors' }, active ? {} : { _hover: { bg: 'bg/60' } })}
                      >
                        <AccountIcon account={bank} />
                        <div className={css({ flex: '1', minW: '0' })}>
                          <div className={css({ fontSize: '15', truncate: true }, active ? { fontWeight: 'semibold' } : { fontWeight: 'medium' }, { color: 'ink' })}>{bank.name}</div>
                          <div className={css({ fontSize: '12', color: 'muted', truncate: true })}>
                            {ACCOUNT_KINDS[bank.kind].label}{bank.archived ? ' · arquivada' : ''}
                          </div>
                        </div>
                        <div className={cx(css({ fontSize: '15', fontWeight: 'bold', flexShrink: '0' }, bank.balance < 0 ? { color: 'expense' } : { color: 'ink' }), nums)}>
                          {formatBalance(bank.balance)}
                        </div>
                      </button>
                    )}
                  {bankCards.map(c => (
                    <div key={c.id} className={css({ pl: '7' })}>
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
              <div className={css({ px: '5', md: { px: '6' }, pt: '3', pb: '1', fontSize: '11', fontWeight: 'semibold', textTransform: 'uppercase', letterSpacing: 'widest', color: 'muted' })}>Empréstimos</div>
              <ul className={css({ m: '0', p: '0', listStyle: 'none', px: '2', md: { px: '3' } })}>
                {loans.map(l => (
                  <li key={l.loanId}>
                    <button onClick={() => onOpenLoan(l.loanId)} className={css({ w: 'full', display: 'flex', alignItems: 'center', gap: '3', px: '3', h: '14', rounded: 'xl', textAlign: 'left', _hover: { bg: 'bg/60' }, transition: 'colors' })}>
                      <AccountIcon account={l.account} />
                      <div className={css({ flex: '1', minW: '0' })}>
                        <div className={css({ fontSize: '15', fontWeight: 'medium', color: 'ink', truncate: true })}>{l.account.name}</div>
                        <div className={cx(css({ fontSize: '12', truncate: true }, l.next?.status === 'overdue' ? { color: 'expense', fontWeight: 'semibold' } : { color: 'muted' }), nums)}>
                          {l.next
                            ? `parcela ${l.next.n}/${l.total} · ${l.next.status === 'overdue' ? 'venceu' : 'vence'} ${Number(l.next.dueDate.slice(8))} ${MONTH_SHORT[Number(l.next.dueDate.slice(5, 7)) - 1]} · ${formatBRL(l.next.total)}`
                            : 'quitado'}
                        </div>
                      </div>
                      <div className={cx(css({ fontSize: '15', fontWeight: 'bold', flexShrink: '0', color: 'expense' }), nums)}>{l.outstanding > 0 ? `−${formatBRL(l.outstanding)}` : formatBRL(0)}</div>
                      <ChevronRight size={16} strokeWidth={1.75} className={css({ color: 'muted', flexShrink: '0' })} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className={css({ mx: '5', md: { mx: '6' }, mt: '1', py: '3.5', borderTopWidth: '1px', borderColor: 'border', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '3' })}>
            <span className={css({ fontSize: '13', fontWeight: 'semibold', color: 'ink' })}>Patrimônio</span>
            <span className={cx(css({ fontSize: '17', fontWeight: 'bold' }, total < 0 ? { color: 'expense' } : { color: 'ink' }), nums)}>{loading ? '–' : formatBalance(total)}</span>
          </div>
        </>
      )}

      <div className={css({ px: '5', md: { px: '6' }, pb: '4', pt: '1', display: 'flex', justifyContent: 'flex-end' })}>
        <button onClick={onManage} className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', fontSize: '13', fontWeight: 'semibold', color: 'ink', _hover: { opacity: '0.7' } })}>
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
  const due = summary ? formatDayMonth(summary.dueDate) : ''
  return (
    <button
      onClick={onOpen}
      className={css({ w: 'full', display: 'flex', alignItems: 'center', gap: '3', px: '3' }, nested ? { h: '12' } : { h: '14' }, { rounded: 'xl', textAlign: 'left', _hover: { bg: 'bg/60' }, transition: 'colors' })}
    >
      <AccountIcon account={card} size={nested ? 28 : 36} />
      <div className={css({ flex: '1', minW: '0' })}>
        <div className={css({ fontSize: '14', fontWeight: 'medium', color: 'ink', truncate: true })}>{card.name}</div>
        <div className={cx(css({ fontSize: '12', color: 'muted', truncate: true }), nums)}>
          {summary ? `Fatura vence ${due}` : 'Cartão de crédito'}
          {summary?.available != null && ` · disp. ${formatBalance(summary.available)}`}
        </div>
      </div>
      <div className={cx(css({ fontSize: '14', fontWeight: 'bold', flexShrink: '0', color: 'ink' }), nums)}>
        {summary ? formatBRL(Math.max(summary.remaining, 0)) : '–'}
      </div>
      <ChevronRight size={16} strokeWidth={1.75} className={css({ color: 'muted', flexShrink: '0' })} />
    </button>
  )
}
