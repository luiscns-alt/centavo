export type StorageStatus = 'persisted' | 'not-persisted' | 'unsupported'

/** Whether the browser has promised not to evict our IndexedDB under storage pressure */
export async function getStorageStatus(): Promise<StorageStatus> {
  if (!navigator.storage?.persisted) return 'unsupported'
  return (await navigator.storage.persisted()) ? 'persisted' : 'not-persisted'
}

/**
 * Ask for persistent storage. Chrome decides silently (installed PWAs usually
 * get it); Firefox shows a permission prompt — so call this at a moment the
 * user just did something worth keeping, never on startup.
 */
export async function requestPersistentStorage(): Promise<StorageStatus> {
  if (!navigator.storage?.persist) return 'unsupported'
  try {
    return (await navigator.storage.persist()) ? 'persisted' : 'not-persisted'
  } catch {
    return 'not-persisted'
  }
}

const PERSIST_ASKED_KEY = 'centavo:persistAsked'

/** Automatic request after the first save — at most once, so Firefox users aren't re-prompted */
export async function requestPersistentStorageOnce(): Promise<void> {
  try {
    if (localStorage.getItem(PERSIST_ASKED_KEY)) return
    localStorage.setItem(PERSIST_ASKED_KEY, '1')
  } catch {
    return // can't remember we asked, so don't risk prompting every time
  }
  if ((await getStorageStatus()) === 'not-persisted') await requestPersistentStorage()
}

// ─── Last backup timestamp ────────────────────────────────────────────────────
// Per-device convenience only; losing it just hides the "último backup" line.

const LAST_BACKUP_KEY = 'centavo:lastBackupAt'

export function getLastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

export function setLastBackupAt(iso: string): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso)
  } catch {
    // storage blocked — nothing to do
  }
}
