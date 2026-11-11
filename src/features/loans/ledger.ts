/**
 * Write path — Loans & financing: contract + append-only events.
 *
 * Every function validates *inside* the same read-write IndexedDB transaction that writes, so a
 * check can't go stale between reading and writing, and any error rolls the whole operation back.
 * Balances are never stored (see features/accounts/balances.ts).
 */
import { db as defaultDb, type Account, type CentavoDB, type Loan, type LoanEvent, type LoanType, type PaymentMethod, type Transaction, type Transfer } from '../../core/db'
import { dec } from '../../core/decimal'
import { LedgerError, cashAccount, expenseCategory, isISODate, isMethod, isPositiveCentavos } from '../../core/ledger/base'
import { validAccount } from '../accounts'
import { adjustBalance, dueDateOf, initialState, nextInstallment, prepayment, type AmortizationSystem, type LoanTerms, type PrepaymentMode, type RateUnit } from './loanMath'

// ─── Loans & financing ───────────────────────────────────────────────────────

export const LOAN_TYPES: Record<LoanType, { label: string; icon: string }> = {
  mortgage: { label: 'Imobiliário', icon: '🏠' },
  vehicle:  { label: 'Veículo',     icon: '🚗' },
  personal: { label: 'Pessoal',     icon: '💸' },
  payroll:  { label: 'Consignado',  icon: '🧾' },
  other:    { label: 'Outro',       icon: '📄' },
}

export const loanTerms = (l: Loan): LoanTerms => ({
  principal: l.principal, rate: l.rate, termMonths: l.termMonths, system: l.system,
  startDate: l.startDate, firstDueDate: l.firstDueDate, monthlyFees: l.monthlyFees,
})

export interface LoanInput {
  name: string
  type: LoanType
  bankId?: string | null
  principal: number
  rate: { value: string; unit: RateUnit }
  termMonths: number
  system: AmortizationSystem
  startDate: string
  firstDueDate: string
  monthlyFees?: number
  release: 'deposit' | 'direct'
  releaseAccountId?: number
  payFromAccountId: number
  principalCategoryId: number
  interestCategoryId: number
  method?: PaymentMethod
}

const LOAN_TABLES = (d: CentavoDB) => [d.loans, d.loanEvents, d.accounts, d.transactions, d.transfers, d.categories]

/** Parse and bound the rate as typed ("0,7974"): 0–30% a.m. or 0–1000% a.a. */
function validRate(rate: LoanInput['rate']) {
  let pct
  try { pct = dec(rate.value) } catch { throw new LedgerError('Taxa de juros inválida.') }
  if (rate.unit !== 'monthly' && rate.unit !== 'annual') throw new LedgerError('Informe se a taxa é ao mês ou ao ano.')
  const max = dec(rate.unit === 'monthly' ? '30' : '1000')
  if (pct < 0n || pct > max) throw new LedgerError('Taxa de juros fora do intervalo aceito.')
  return { value: rate.value.trim().replace(',', '.'), unit: rate.unit }
}

/** The loan, its last event and the state after it — read inside the caller's transaction */
async function loanNow(database: CentavoDB, loanId: number) {
  const loan = await database.loans.get(loanId)
  if (!loan) throw new LedgerError('Empréstimo não encontrado.')
  const events = await database.loanEvents.where('[loanId+seq]').between([loanId, 0], [loanId, Infinity]).toArray()
  const last = events[events.length - 1]
  if (!last) throw new LedgerError('Empréstimo sem histórico — dados inconsistentes.')
  return { loan, terms: loanTerms(loan), events, last }
}

/**
 * Register a loan: its account (the debt), the contract and the release event, in one
 * transaction. deposit → a transfer brings the money into the bank account (not income);
 * direct → the debt starts at −principal on the loan account.
 */
export async function createLoan(input: LoanInput, database: CentavoDB = defaultDb): Promise<{ loanId: number; accountId: number }> {
  return database.transaction('rw', LOAN_TABLES(database), async () => {
    if (!isPositiveCentavos(input.principal)) throw new LedgerError('Informe o valor do empréstimo.')
    if (!Number.isInteger(input.termMonths) || input.termMonths < 1 || input.termMonths > 600) throw new LedgerError('Prazo: de 1 a 600 meses.')
    if (input.system !== 'price' && input.system !== 'sac') throw new LedgerError('Escolha Price ou SAC.')
    if (!(input.type in LOAN_TYPES)) throw new LedgerError('Tipo de empréstimo inválido.')
    if (!isISODate(input.startDate) || !isISODate(input.firstDueDate)) throw new LedgerError('Datas inválidas.')
    if (input.firstDueDate <= input.startDate) throw new LedgerError('O primeiro vencimento precisa ser depois da data de início.')
    if (input.monthlyFees !== undefined && (!Number.isSafeInteger(input.monthlyFees) || input.monthlyFees < 0)) throw new LedgerError('Encargo mensal inválido.')
    if (input.method !== undefined && (!isMethod(input.method) || input.method === 'credit')) throw new LedgerError('Forma de pagamento inválida.')
    const rate = validRate(input.rate)
    await cashAccount(database, input.payFromAccountId, 'Conta de pagamento')
    if (input.release === 'deposit') await cashAccount(database, input.releaseAccountId, 'Conta que recebeu o dinheiro')
    else if (input.release !== 'direct') throw new LedgerError('Informe como o dinheiro foi liberado.')
    await expenseCategory(database, input.principalCategoryId, 'Categoria da parcela')
    await expenseCategory(database, input.interestCategoryId, 'Categoria dos juros')

    const clean = await validAccount(database, {
      name: input.name, kind: 'loan', icon: LOAN_TYPES[input.type].icon, bankId: input.bankId,
      openingBalance: input.release === 'direct' ? -input.principal : 0, openingDate: input.startDate,
    }, undefined, true)
    const account: Omit<Account, 'id'> = { ...clean, archived: 0, createdAt: Date.now() }
    if (!account.bankId) delete account.bankId
    delete account.card
    const accountId = await database.accounts.add(account as Account) as number

    const loan: Loan = {
      accountId, type: input.type, principal: input.principal, rate, termMonths: input.termMonths, system: input.system,
      startDate: input.startDate, firstDueDate: input.firstDueDate, release: input.release,
      payFromAccountId: input.payFromAccountId, principalCategoryId: input.principalCategoryId,
      interestCategoryId: input.interestCategoryId, method: input.method ?? 'boleto', createdAt: Date.now(),
    }
    if (input.monthlyFees) loan.monthlyFees = input.monthlyFees
    if (input.release === 'deposit') loan.releaseAccountId = input.releaseAccountId
    const loanId = await database.loans.add(loan) as number

    const terms = loanTerms(loan)
    let transferId: number | undefined
    if (input.release === 'deposit') {
      transferId = await database.transfers.add({
        fromAccountId: accountId, toAccountId: input.releaseAccountId!, amount: input.principal, date: input.startDate,
        description: `Liberação · ${clean.name}`, loanId, createdAt: Date.now(),
      } as Transfer) as number
    }
    const release: LoanEvent = {
      loanId, seq: 1, kind: 'release', date: input.startDate, amount: input.principal,
      interest: 0, principal: 0, fees: 0, state: initialState(terms), transactionIds: [], createdAt: Date.now(),
    }
    if (transferId !== undefined) release.transferId = transferId
    await database.loanEvents.add(release)
    return { loanId, accountId }
  })
}

/** Expense rows of an installment/prepayment, linked to its event (zero parts are skipped) */
async function writeLoanExpenses(
  database: CentavoDB, eventId: number, accountId: number, date: string, method: PaymentMethod,
  parts: { amount: number; categoryId: number; description: string }[],
): Promise<number[]> {
  const ids: number[] = []
  for (const p of parts) {
    if (p.amount <= 0) continue
    ids.push(await database.transactions.add({
      type: 'expense', amount: p.amount, categoryId: p.categoryId, accountId, date, month: date.slice(0, 7),
      method, description: p.description, loanEventId: eventId, createdAt: Date.now(),
    } as Transaction) as number)
  }
  return ids
}

export interface LoanPaymentInput {
  loanId: number
  date: string
  fromAccountId?: number
  method?: PaymentMethod
}

/**
 * Pay the next installment: one event with the snapshot of its split, and the whole installment
 * as expenses on the bank account (principal + fees in the loan's category, interest in the
 * interest category) — all in one transaction.
 */
export async function payLoanInstallment(input: LoanPaymentInput, database: CentavoDB = defaultDb): Promise<number> {
  return database.transaction('rw', LOAN_TABLES(database), async () => {
    const { loan, terms, last } = await loanNow(database, input.loanId)
    if (!isISODate(input.date)) throw new LedgerError('Data inválida.')
    if (input.date < last.date) throw new LedgerError('A data não pode ser anterior ao último movimento do empréstimo.')
    if (last.state.balance <= 0) throw new LedgerError('Este empréstimo já está quitado.')
    const fromId = input.fromAccountId ?? loan.payFromAccountId
    await cashAccount(database, fromId, 'Conta de pagamento')
    const method = input.method ?? loan.method
    if (!isMethod(method) || method === 'credit') throw new LedgerError('Forma de pagamento inválida.')

    const { inst, state } = nextInstallment(terms, last.state)
    const total = last.state.next - 1 + last.state.remaining
    const name = (await database.accounts.get(loan.accountId))?.name ?? 'Empréstimo'
    const eventId = await database.loanEvents.add({
      loanId: loan.id!, seq: last.seq + 1, kind: 'payment', date: input.date, amount: inst.total,
      installment: inst.n, interest: inst.interest, principal: inst.principal, fees: inst.fees,
      state, transactionIds: [], createdAt: Date.now(),
    }) as number
    const ids = await writeLoanExpenses(database, eventId, fromId, input.date, method, [
      { amount: inst.principal + inst.fees, categoryId: loan.principalCategoryId, description: `Parcela ${inst.n}/${total} · ${name}` },
      { amount: inst.interest, categoryId: loan.interestCategoryId, description: `Juros ${inst.n}/${total} · ${name}` },
    ])
    await database.loanEvents.update(eventId, { transactionIds: ids })
    return eventId
  })
}

export interface LoanPrepaymentInput extends LoanPaymentInput {
  amount: number
  mode: PrepaymentMode
}

/** Extra amortization: pro-rata interest first, the rest lowers the balance; term or payment shrinks */
export async function prepayLoan(input: LoanPrepaymentInput, database: CentavoDB = defaultDb): Promise<number> {
  return database.transaction('rw', LOAN_TABLES(database), async () => {
    const { loan, terms, last } = await loanNow(database, input.loanId)
    if (!isISODate(input.date)) throw new LedgerError('Data inválida.')
    if (input.date < last.date) throw new LedgerError('A data não pode ser anterior ao último movimento do empréstimo.')
    if (!isPositiveCentavos(input.amount)) throw new LedgerError('Informe o valor da antecipação.')
    if (input.mode !== 'reduce-term' && input.mode !== 'reduce-payment') throw new LedgerError('Escolha reduzir prazo ou parcela.')
    if (last.state.balance <= 0) throw new LedgerError('Este empréstimo já está quitado.')
    const nextDue = dueDateOf(terms, last.state.next)
    // On (or after) a due date, that installment comes first — otherwise the prepayment would
    // absorb the whole period's interest and leave an interest-free installment on the same day
    if (input.date >= nextDue) throw new LedgerError(`Pague antes a parcela ${last.state.next}, que vence${input.date > nextDue ? 'u' : ''} em ${nextDue.split('-').reverse().join('/')}.`)
    const fromId = input.fromAccountId ?? loan.payFromAccountId
    await cashAccount(database, fromId, 'Conta de pagamento')
    const method = input.method ?? loan.method
    if (!isMethod(method) || method === 'credit') throw new LedgerError('Forma de pagamento inválida.')

    let calc
    try { calc = prepayment(terms, last.state, input.date, input.amount, input.mode) } catch (e) {
      throw new LedgerError(e instanceof Error && e.message.startsWith('O valor passa')
        ? 'O valor passa do saldo para quitação.'
        : e instanceof Error ? e.message : 'Antecipação inválida.')
    }
    const name = (await database.accounts.get(loan.accountId))?.name ?? 'Empréstimo'
    const eventId = await database.loanEvents.add({
      loanId: loan.id!, seq: last.seq + 1, kind: 'prepayment', date: input.date, amount: input.amount,
      interest: calc.interest, principal: calc.principal, fees: 0, mode: input.mode,
      state: calc.state, transactionIds: [], createdAt: Date.now(),
    }) as number
    const ids = await writeLoanExpenses(database, eventId, fromId, input.date, method, [
      { amount: calc.principal, categoryId: loan.principalCategoryId, description: `${calc.payoff ? 'Quitação' : 'Amortização extra'} · ${name}` },
      { amount: calc.interest, categoryId: loan.interestCategoryId, description: `Juros pró-rata · ${name}` },
    ])
    await database.loanEvents.update(eventId, { transactionIds: ids })
    return eventId
  })
}

/** Align the outstanding balance with the bank's statement (no money moves) */
export async function adjustLoanBalance(
  input: { loanId: number; date: string; balance: number }, database: CentavoDB = defaultDb,
): Promise<number> {
  return database.transaction('rw', LOAN_TABLES(database), async () => {
    const { loan, terms, last } = await loanNow(database, input.loanId)
    if (!isISODate(input.date) || input.date < last.date) throw new LedgerError('Data inválida.')
    if (!Number.isSafeInteger(input.balance) || input.balance < 0) throw new LedgerError('Saldo inválido.')
    const state = adjustBalance(terms, last.state, input.balance)
    return database.loanEvents.add({
      loanId: loan.id!, seq: last.seq + 1, kind: 'adjust', date: input.date, amount: input.balance,
      interest: 0, principal: last.state.balance - input.balance, fees: 0, state, transactionIds: [], createdAt: Date.now(),
    }) as Promise<number>
  })
}

/** Undo the most recent payment / prepayment / adjustment, with the expenses it generated */
export async function undoLastLoanEvent(loanId: number, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', LOAN_TABLES(database), async () => {
    const { last } = await loanNow(database, loanId)
    if (last.kind === 'release') throw new LedgerError('Não há movimento para desfazer.')
    await database.transactions.bulkDelete(last.transactionIds)
    await database.loanEvents.delete(last.id!)
  })
}

/** Delete a loan that has no payments yet: contract, release, account — all together */
export async function deleteLoan(loanId: number, database: CentavoDB = defaultDb): Promise<void> {
  await database.transaction('rw', LOAN_TABLES(database), async () => {
    const { loan, events } = await loanNow(database, loanId)
    if (events.length > 1) throw new LedgerError('O empréstimo tem pagamentos — desfaça-os antes de excluir.')
    if (events[0].transferId !== undefined) await database.transfers.delete(events[0].transferId)
    await database.loanEvents.where('loanId').equals(loanId).delete()
    await database.loans.delete(loanId)
    await database.accounts.delete(loan.accountId)
  })
}
