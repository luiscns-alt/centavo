import type { StorageKey } from '../constants/storageKeys'

/**
 * localStorage that never throws: private mode, blocked site data or a full quota just mean
 * "not remembered". Use only for per-device conveniences, never for data that must survive.
 */
export function readLocal(key: StorageKey): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

/** null removes the key */
export function writeLocal(key: StorageKey, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* not remembered */ }
}

export function readJSON<T>(key: StorageKey, fallback: T): T {
  const raw = readLocal(key)
  if (raw === null) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

export function writeJSON(key: StorageKey, value: unknown): void {
  try { writeLocal(key, JSON.stringify(value)) } catch { /* not serializable */ }
}
