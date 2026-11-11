/**
 * Every localStorage key the app uses — per-device conveniences only (filters, last choices,
 * dismissed hints, the Início snapshot). Real data lives in IndexedDB.
 */
export const STORAGE_KEYS = {
  accountFilter: 'centavo:accountFilter',
  analysisView: 'centavo:analysisView',
  comparePeriod: 'centavo:comparePeriod',
  budgetAlerts: 'centavo:budgetAlerts',
  regroupDismissed: 'centavo:regroupDismissed',
  homeSnapshot: 'centavo:homeSnapshot',
  lastAccount: 'centavo:lastAccount',
  /** Last payment method used with an account */
  lastMethod: (accountId: number) => `centavo:lastMethod:${accountId}` as const,
  lastBackupAt: 'centavo:lastBackupAt',
  persistAsked: 'centavo:persistAsked',
} as const

/** Every key lives under the app's prefix */
export type StorageKey = `centavo:${string}`
