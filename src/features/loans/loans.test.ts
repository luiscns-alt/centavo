import 'fake-indexeddb/auto' // must load before Dexie
import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { CentavoDB } from '../../core/db'
import { LedgerError } from '../../core/ledger/base'
import { createAccount, accountBalances, loanCredits, sumBalances } from '../accounts'
import { adjustLoanBalance, createLoan, deleteLoan, payLoanInstallment, prepayLoan, undoLastLoanEvent, type LoanInput } from './ledger'
import { createTransfer, deleteTransaction } from '../transactions'
import { initialState, originalSchedule, payoffAmount } from './loanMath'

const opened: Dexie[] = []
let seq = 0
function freshDB(): CentavoDB {
  const db = new CentavoDB(`loans-test-${++seq}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await Dexie.delete(db.name)
  }
})

const ALIMENTACAO = 6
const TRANSPORTE = 7

async function setup(over: Partial<LoanInput> = {}) {
  const db = freshDB()
  const bank = await createAccount({ name: 'Banco', kind: 'checking', openingBalance: 2_000_000, openingDate: '2026-01-01' }, db)
  const input: LoanInput = {
    name: 'Carro', type: 'vehicle', principal: 10_000_000, rate: { value: '1', unit: 'monthly' }, termMonths: 12,
    system: 'price', startDate: '2026-01-10', firstDueDate: '2026-02-10', release: 'direct',
    payFromAccountId: bank, principalCategoryId: TRANSPORTE, interestCategoryId: ALIMENTACAO, ...over,
  }
  const { loanId, accountId } = await createLoan(input, db)
  const balances = async () => {
    const [a, t, tr, l, e] = await Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.transfers.toArray(), db.loans.toArray(), db.loanEvents.toArray()])
    return accountBalances(a, t, tr, undefined, loanCredits(l, e))
  }
  return { db, bank, loanId, accountId, balances }
}

describe('createLoan', () => {
  it('direct financing: the debt starts at −principal, nothing enters the bank', async () => {
    const { db, bank, accountId, balances } = await setup()
    const b = await balances()
    expect([b.get(bank), b.get(accountId)]).toEqual([2_000_000, -10_000_000])
    expect(await db.transfers.count()).toBe(0)
    expect((await db.loanEvents.toArray()).map(e => e.kind)).toEqual(['release'])
  })

  it('deposit: the money lands in the bank as a transfer (not income) and patrimônio is unchanged', async () => {
    await expect(setup({ release: 'deposit', releaseAccountId: undefined })).rejects.toBeInstanceOf(LedgerError)
    const s = await setup({ release: 'deposit', releaseAccountId: 1 })
    const b = await s.balances()
    expect([b.get(s.bank), b.get(s.accountId)]).toEqual([12_000_000, -10_000_000])
    expect(sumBalances(b)).toBe(2_000_000)
    expect(await s.db.transactions.count()).toBe(0)
  })

  it('validates the contract', async () => {
    const bad: Partial<LoanInput>[] = [
      { principal: 0 }, { termMonths: 0 }, { termMonths: 601 }, { rate: { value: 'abc', unit: 'monthly' } },
      { rate: { value: '31', unit: 'monthly' } }, { firstDueDate: '2026-01-10' }, { principalCategoryId: 1 },
    ]
    for (const b of bad) await expect(setup(b)).rejects.toBeInstanceOf(LedgerError)
  })
})

describe('paying installments', () => {
  it('matches the schedule, records the whole installment as expense and lowers the debt by the principal', async () => {
    const { db, loanId, bank, accountId, balances } = await setup()
    const sched = originalSchedule({
      principal: 10_000_000, rate: { value: '1', unit: 'monthly' }, termMonths: 12, system: 'price',
      startDate: '2026-01-10', firstDueDate: '2026-02-10',
    })
    const eventId = await payLoanInstallment({ loanId, date: '2026-02-10' }, db)
    const ev = (await db.loanEvents.get(eventId))!
    expect([ev.installment, ev.interest, ev.principal, ev.amount]).toEqual([1, sched[0].interest, sched[0].principal, 888_488])
    const txs = await db.transactions.toArray()
    expect(txs.map(t => [t.categoryId, t.amount, t.method, t.loanEventId])).toEqual([
      [TRANSPORTE, sched[0].principal, 'boleto', eventId],
      [ALIMENTACAO, sched[0].interest, 'boleto', eventId],
    ])
    const b = await balances()
    expect(b.get(bank)).toBe(2_000_000 - 888_488)
    expect(b.get(accountId)).toBe(-10_000_000 + sched[0].principal)
    // generated rows are edited through the loan
    await expect(deleteTransaction(txs[0].id!, db)).rejects.toBeInstanceOf(LedgerError)
  })

  it('pays the whole schedule down to exactly zero', async () => {
    const { db, loanId, accountId, balances } = await setup({ system: 'sac' })
    for (let k = 0; k < 12; k++) await payLoanInstallment({ loanId, date: `2026-${String(k + 2).padStart(2, '0')}-10`.replace('2026-13', '2027-01') }, db)
    expect((await balances()).get(accountId)).toBe(0)
    await expect(payLoanInstallment({ loanId, date: '2027-02-10' }, db)).rejects.toBeInstanceOf(LedgerError)
  })

  it('refuses dates before the last movement', async () => {
    const { db, loanId } = await setup()
    await payLoanInstallment({ loanId, date: '2026-02-10' }, db)
    await expect(payLoanInstallment({ loanId, date: '2026-02-01' }, db)).rejects.toBeInstanceOf(LedgerError)
  })
})

describe('prepayment', () => {
  it('pays pro-rata interest, lowers the balance and keeps paid history intact', async () => {
    const { db, loanId, accountId, balances } = await setup({ termMonths: 24 })
    await payLoanInstallment({ loanId, date: '2026-02-10' }, db)
    const paidBefore = (await db.loanEvents.toArray())[1]
    await prepayLoan({ loanId, date: '2026-02-25', amount: 2_000_000, mode: 'reduce-term' }, db)
    const evs = (await db.loanEvents.toArray()).sort((a, b) => a.seq - b.seq)
    expect(evs[1]).toEqual(paidBefore) // history untouched
    const pre = evs[2]
    expect(pre.interest).toBeGreaterThan(0)
    expect(pre.interest + pre.principal).toBe(2_000_000)
    expect(pre.state.remaining).toBeLessThan(23)
    const b = await balances()
    expect(b.get(accountId)).toBe(-pre.state.balance)
  })

  it('refuses prepaying on/after an unpaid due date and more than the payoff', async () => {
    const { db, loanId } = await setup()
    await expect(prepayLoan({ loanId, date: '2026-03-01', amount: 100_000, mode: 'reduce-term' }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(prepayLoan({ loanId, date: '2026-02-10', amount: 100_000, mode: 'reduce-term' }, db)).rejects.toBeInstanceOf(LedgerError)
    await expect(prepayLoan({ loanId, date: '2026-01-20', amount: 99_999_999, mode: 'reduce-term' }, db)).rejects.toBeInstanceOf(LedgerError)
  })

  it('a payoff closes the loan', async () => {
    const { db, loanId, accountId, balances } = await setup()
    const loan = (await db.loans.get(loanId))!
    const amount = payoffAmount({ ...loan }, initialState({ ...loan }), '2026-01-25')
    await prepayLoan({ loanId, date: '2026-01-25', amount, mode: 'reduce-term' }, db)
    expect((await balances()).get(accountId)).toBe(0)
    await expect(payLoanInstallment({ loanId, date: '2026-02-10' }, db)).rejects.toBeInstanceOf(LedgerError)
  })
})

describe('adjust, undo, delete', () => {
  it('adjusting to the bank statement moves the debt without moving money', async () => {
    const { db, loanId, bank, accountId, balances } = await setup()
    await payLoanInstallment({ loanId, date: '2026-02-10' }, db)
    const before = await balances()
    await adjustLoanBalance({ loanId, date: '2026-02-15', balance: -before.get(accountId)! - 50 }, db)
    const after = await balances()
    expect(after.get(accountId)).toBe(before.get(accountId)! + 50)
    expect(after.get(bank)).toBe(before.get(bank))
  })

  it('undo removes only the last event and its expenses', async () => {
    const { db, loanId, bank, balances } = await setup()
    await payLoanInstallment({ loanId, date: '2026-02-10' }, db)
    const mid = await balances()
    await payLoanInstallment({ loanId, date: '2026-03-10' }, db)
    await undoLastLoanEvent(loanId, db)
    expect((await balances()).get(bank)).toBe(mid.get(bank))
    expect(await db.loanEvents.count()).toBe(2)
    await undoLastLoanEvent(loanId, db)
    await expect(undoLastLoanEvent(loanId, db)).rejects.toBeInstanceOf(LedgerError)
  })

  it('deleting is only possible before any payment, and removes everything', async () => {
    const s = await setup({ release: 'deposit', releaseAccountId: 1 })
    await payLoanInstallment({ loanId: s.loanId, date: '2026-02-10' }, s.db)
    await expect(deleteLoan(s.loanId, s.db)).rejects.toBeInstanceOf(LedgerError)
    await undoLastLoanEvent(s.loanId, s.db)
    await deleteLoan(s.loanId, s.db)
    expect([await s.db.loans.count(), await s.db.loanEvents.count(), await s.db.transfers.count()]).toEqual([0, 0, 0])
    expect(await s.db.accounts.get(s.accountId)).toBeUndefined()
  })

  it('loan accounts are off-limits to generic transfers', async () => {
    const { db, bank, accountId } = await setup()
    await expect(createTransfer({ fromAccountId: bank, toAccountId: accountId, amount: 1, date: '2026-02-01' }, db)).rejects.toBeInstanceOf(LedgerError)
  })
})
