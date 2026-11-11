/**
 * Início — the "how am I doing today" read model. One pure function over the ledger, fed by a
 * single read transaction (loadHomeSummary): every number on the top of the screen comes from the
 * same instant, so the balance never shows a write the invoice hasn't seen yet.
 *
 * Above the fold everything is about TODAY (not the month picked in the header):
 * - available: balance of cash accounts (checking, savings, wallet, investment) — no cards/loans;
 * - outlook: what still leaves this month = open invoices due by month end + unpaid loan
 *   installments due by month end; projectedFree = available − that (recurring: later);
 * - alerts: overdue invoice / loan installment, negative account, budget over / ≥80%, invoice due
 *   in ≤ 5 days — worst first.
 * The month below the fold (flows, chart, categories) keeps its own queries.
 * All amounts are integer centavos.
 */
import { accountBalances, loanCredits } from '../accounts'
import { buildBudgetDashboard, type BudgetStatus } from '../budgets'
import { buildCardInvoices } from '../credit-cards'
import { db as defaultDb, type CentavoDB } from '../../core/db'
import { isCashAccount } from '../../core/ledger/base'
import { buildLoanSchedule } from '../loans'
import type { Account, BudgetOverride, BudgetPlan, CardSettings, Category, Loan, LoanEvent, Transaction, Transfer } from '../../core/types'
import { daysBetween, formatDayMonthNumeric, lastDayOfMonth } from '../../shared/utils/dates'

export const HOME_SUMMARY_VERSION = 1
export const DUE_SOON_DAYS = 5

export type AlertKind = 'invoice_overdue' | 'loan_overdue' | 'account_negative' | 'budget_over' | 'invoice_due' | 'budget_warning'
export type AlertTarget =
  | { screen: 'card'; id: number }
  | { screen: 'loan'; id: number }
  | { screen: 'budgets' }
  | { screen: 'accounts' }

export interface HomeAlert {
  kind: AlertKind
  /** 4 overdue · 3 over / negative · 2 due soon · 1 warning */
  severity: 1 | 2 | 3 | 4
  title: string
  amount: number
  date?: string
  target: AlertTarget
}

export interface HomeCard {
  id: number
  name: string
  icon: string
  bankId?: string
  invoiceMonth: string
  dueDate: string
  /** Still owed on the invoice to pay now */
  remaining: number
  overdue: boolean
  limit: number | null
  available: number | null
}

export interface HomeLoan {
  id: number
  name: string
  outstanding: number
  next?: { n: number; dueDate: string; total: number; overdue: boolean }
}

export interface HomeSummary {
  version: number
  asOf: string
  month: string
  health: { status: 'ok' | 'attention' | 'critical'; reason: string }
  /** Every account's balance today (cards and loans included) — the patrimônio is their sum */
  balances: Record<number, number>
  available: { total: number; accounts: { id: number; name: string; icon: string; bankId?: string; kind: Account['kind']; balance: number }[] }
  outlook: { dueThisMonth: { invoices: number; loans: number; recurring: null }; projectedFree: number }
  alerts: HomeAlert[]
  cards: { toPay: number; items: HomeCard[] }
  budgets: { has: boolean; budgeted: number; spent: number; remaining: number; alertCount: number; top: { categoryId: number; name: string; icon: string; status: BudgetStatus; spent: number; limit: number }[] }
  goals: null
  loans: HomeLoan[]
  meta: { computedMs: number }
}

export interface HomeInput {
  today: string
  /** Account filter (null = all). Budgets stay global */
  scope: number[] | null
  accounts: Account[]
  transactions: Transaction[]
  transfers: Transfer[]
  loans: Loan[]
  loanEvents: LoanEvent[]
  categories: Category[]
  budgets: BudgetPlan[]
  budgetOverrides: BudgetOverride[]
}



export function buildHomeSummary(input: HomeInput): HomeSummary {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0
  const { today, accounts } = input
  const month = today.slice(0, 7)
  const monthEnd = lastDayOfMonth(month)
  const inScope = (id: number) => input.scope === null || input.scope.includes(id)
  const alerts: HomeAlert[] = []

  // ── Available: cash accounts, today ─────────────────────────────────────
  const bal = accountBalances(accounts, input.transactions, input.transfers, today, loanCredits(input.loans, input.loanEvents))
  const cash = accounts
    .filter(a => a.id != null && !a.archived && isCashAccount(a) && inScope(a.id))
    .map(a => ({ id: a.id as number, name: a.name, icon: a.icon, bankId: a.bankId, kind: a.kind, balance: bal.get(a.id as number) ?? 0 }))
  const availableTotal = cash.reduce((s, a) => s + a.balance, 0)
  for (const a of cash) {
    if (a.balance < 0) alerts.push({ kind: 'account_negative', severity: 3, title: `${a.name} está negativa`, amount: -a.balance, target: { screen: 'accounts' } })
  }

  // ── Cards: the invoice to pay now ───────────────────────────────────────
  const cards = accounts.filter((a): a is Account & { id: number; card: CardSettings } =>
    a.id != null && !a.archived && a.kind === 'credit' && !!a.card && inScope(a.id))
  const txByAccount = new Map<number, Transaction[]>()
  for (const t of input.transactions) {
    const list = txByAccount.get(t.accountId)
    if (list) list.push(t)
    else txByAccount.set(t.accountId, [t])
  }
  let invoicesDue = 0
  const cardItems: HomeCard[] = cards.map(card => {
    const l = buildCardInvoices(card, txByAccount.get(card.id) ?? [], input.transfers.filter(t => t.toAccountId === card.id), today)
    const inv = l.dueInvoice
    const remaining = Math.max(0, inv.remaining)
    const overdue = inv.dueDate < today && remaining > 0
    if (remaining > 0 && inv.dueDate <= monthEnd) invoicesDue += remaining
    if (overdue) {
      alerts.push({ kind: 'invoice_overdue', severity: 4, title: `Fatura ${card.name} venceu em ${formatDayMonthNumeric(inv.dueDate)}`, amount: remaining, date: inv.dueDate, target: { screen: 'card', id: card.id } })
    } else if (remaining > 0 && daysBetween(today, inv.dueDate) <= DUE_SOON_DAYS) {
      const d = daysBetween(today, inv.dueDate)
      alerts.push({
        kind: 'invoice_due', severity: 2, amount: remaining, date: inv.dueDate, target: { screen: 'card', id: card.id },
        title: `Fatura ${card.name} vence ${d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`}`,
      })
    }
    return {
      id: card.id, name: card.name, icon: card.icon, bankId: card.bankId,
      invoiceMonth: inv.invoiceMonth, dueDate: inv.dueDate, remaining, overdue,
      limit: card.card.limit ?? null, available: l.available,
    }
  })

  // ── Loans: unpaid installments due by month end ─────────────────────────
  let loansDue = 0
  const loans: HomeLoan[] = []
  for (const loan of input.loans) {
    const account = accounts.find(a => a.id === loan.accountId)
    const events = input.loanEvents.filter(e => e.loanId === loan.id)
    if (!account || events.length === 0 || account.archived) continue
    if (!(inScope(loan.payFromAccountId) || inScope(loan.accountId))) continue
    const s = buildLoanSchedule(loan, account, events, today)
    for (const r of s.installments) {
      if (r.status === 'paid' || r.dueDate > monthEnd) continue
      loansDue += r.total
      if (r.status === 'overdue') {
        alerts.push({ kind: 'loan_overdue', severity: 4, title: `Parcela ${r.n} de ${account.name} venceu em ${formatDayMonthNumeric(r.dueDate)}`, amount: r.total, date: r.dueDate, target: { screen: 'loan', id: loan.id as number } })
      }
    }
    const next = s.summary.next
    loans.push({
      id: loan.id as number, name: account.name, outstanding: s.summary.outstanding,
      next: next && { n: next.n, dueDate: next.dueDate, total: next.total, overdue: next.status === 'overdue' },
    })
  }

  // ── Budgets of the current month (global) ───────────────────────────────
  const dash = buildBudgetDashboard({
    month, today,
    categories: input.categories, plans: input.budgets, overrides: input.budgetOverrides,
    transactions: input.transactions.filter(t => t.month === month),
  })
  for (const l of dash.alerts) {
    const over = l.status === 'over'
    alerts.push({
      kind: over ? 'budget_over' : 'budget_warning', severity: over ? 3 : 1, target: { screen: 'budgets' },
      amount: over ? -(l.remaining ?? 0) : l.spent,
      title: over ? `${l.category.name} estourou o orçamento` : `${l.category.name} em ${Math.round((l.ratio ?? 0) * 100)}% do orçamento`,
    })
  }

  alerts.sort((a, b) => b.severity - a.severity || (a.date ?? '').localeCompare(b.date ?? '') || b.amount - a.amount)

  const projectedFree = availableTotal - invoicesDue - loansDue
  const worst = alerts[0]?.severity ?? 0
  const health: HomeSummary['health'] =
    worst >= 3 || availableTotal < 0 ? { status: 'critical', reason: alerts[0]?.title ?? 'Saldo disponível negativo' }
      : worst > 0 || projectedFree < 0 ? { status: 'attention', reason: alerts[0]?.title ?? 'As contas do mês passam do disponível' }
        : { status: 'ok', reason: 'Tudo em dia' }

  return {
    version: HOME_SUMMARY_VERSION,
    asOf: today,
    month,
    health,
    balances: Object.fromEntries(bal),
    available: { total: availableTotal, accounts: cash },
    outlook: { dueThisMonth: { invoices: invoicesDue, loans: loansDue, recurring: null }, projectedFree },
    alerts,
    cards: { toPay: cardItems.reduce((s, c) => s + c.remaining, 0), items: cardItems },
    budgets: {
      has: dash.hasBudgets, budgeted: dash.totals.budgeted, spent: dash.totals.budgetedSpent, remaining: dash.totals.remaining,
      alertCount: dash.alerts.length,
      top: dash.alerts.slice(0, 3).map(l => ({ categoryId: l.category.id as number, name: l.category.name, icon: l.category.icon, status: l.status, spent: l.spent, limit: l.limit ?? 0 })),
    },
    goals: null,
    loans,
    meta: { computedMs: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0 },
  }
}

/** Everything the summary needs, in one read-only transaction (one consistent snapshot) */
export async function loadHomeSummary(today: string, scope: number[] | null, database: CentavoDB = defaultDb): Promise<HomeSummary> {
  const t = database
  const data = await t.transaction('r', [t.accounts, t.transactions, t.transfers, t.loans, t.loanEvents, t.categories, t.budgets, t.budgetOverrides], () =>
    Promise.all([
      t.accounts.toArray(), t.transactions.toArray(), t.transfers.toArray(), t.loans.toArray(), t.loanEvents.toArray(),
      t.categories.where('type').equals('expense').toArray(), t.budgets.toArray(), t.budgetOverrides.toArray(),
    ]))
  const [accounts, transactions, transfers, loans, loanEvents, categories, budgets, budgetOverrides] = data
  return buildHomeSummary({ today, scope, accounts, transactions, transfers, loans, loanEvents, categories, budgets, budgetOverrides })
}
