import type { Transaction } from './types'

/** Effect on the account balance: income and refunds add, expenses subtract */
export const signedAmount = (t: Pick<Transaction, 'type' | 'amount'>) => (t.type === 'expense' ? -t.amount : t.amount)

/** Effect on spending (despesas): expenses add, refunds give back, income doesn't count */
export const expenseDelta = (t: Pick<Transaction, 'type' | 'amount'>) =>
  t.type === 'expense' ? t.amount : t.type === 'refund' ? -t.amount : 0
