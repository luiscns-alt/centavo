import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { HOME_SUMMARY_VERSION, loadHomeSummary, type HomeSummary } from './home'
import { todayISO } from '../../shared/utils/dates'
import { STORAGE_KEYS } from '../../shared/constants/storageKeys'
import { readJSON, writeJSON } from '../../shared/utils/storage'

interface Snapshot { scope: string; data: HomeSummary }

function readSnapshot(): Snapshot | null {
  const s = readJSON<Snapshot | null>(STORAGE_KEYS.homeSnapshot, null)
  return s && s.data?.version === HOME_SUMMARY_VERSION ? s : null
}

/**
 * The Início summary, live. While the first read runs, the last summary saved on this device is
 * shown (same day and same account filter only) — display-only, replaced within milliseconds.
 */
export function useHomeSummary(scope: number[] | null): { data: HomeSummary | undefined; stale: boolean } {
  const scopeKey = scope?.join(',') ?? '*'
  const live = useLiveQuery(() => loadHomeSummary(todayISO(), scope), [scopeKey])
  const [snapshot] = useState(readSnapshot)

  useEffect(() => {
    if (!live) return
    writeJSON(STORAGE_KEYS.homeSnapshot, { scope: scopeKey, data: live } satisfies Snapshot)
  }, [live, scopeKey])

  if (live) return { data: live, stale: false }
  const usable = snapshot && snapshot.scope === scopeKey && snapshot.data.asOf === todayISO()
  return { data: usable ? snapshot.data : undefined, stale: !!usable }
}
