// Public API of the loans feature — other modules import only from here (lint-enforced).
export { LoanForm } from './LoanForm'
export { LoanView } from './LoanView'
export { LOAN_TYPES, createLoan, loanTerms, payLoanInstallment, prepayLoan } from './ledger'
export { adjustBalance, initialState, nextInstallment, prepayment, type AmortizationSystem, type LoanState, type PrepaymentMode, type RateUnit } from './loanMath'
export { buildLoanSchedule } from './loanSchedule'
export { useLoanSummaries } from './useLoans'
