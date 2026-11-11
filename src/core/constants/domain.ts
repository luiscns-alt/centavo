/** Labels, icons and option lists of the domain vocabulary (types in core/types). */
import type { AccountKind, LoanType, PaymentMethod } from '../types'

export const ACCOUNT_KINDS: Record<AccountKind, { label: string; icon: string }> = {
  checking:   { label: 'Conta corrente', icon: '🏦' },
  savings:    { label: 'Poupança',       icon: '🐷' },
  wallet:     { label: 'Carteira',       icon: '👛' },
  investment: { label: 'Investimentos',  icon: '📈' },
  credit:     { label: 'Cartão de crédito', icon: '💳' },
  loan:       { label: 'Empréstimo', icon: '💸' },
}

/** Kinds the account form offers (cards have their own fields; loans are created as loans) */
export const EDITABLE_KINDS: AccountKind[] = ['checking', 'savings', 'wallet', 'investment', 'credit']

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  credit: 'Cartão de crédito',
  debit: 'Débito',
  boleto: 'Boleto',
  cash: 'Dinheiro',
  ted: 'TED',
}

/** Methods offered for non-card accounts, in picker order */
export const ACCOUNT_METHODS: PaymentMethod[] = ['pix', 'debit', 'boleto', 'ted', 'cash']

export const LOAN_TYPES: Record<LoanType, { label: string; icon: string }> = {
  mortgage: { label: 'Imobiliário', icon: '🏠' },
  vehicle:  { label: 'Veículo',     icon: '🚗' },
  personal: { label: 'Pessoal',     icon: '💸' },
  payroll:  { label: 'Consignado',  icon: '🧾' },
  other:    { label: 'Outro',       icon: '📄' },
}
