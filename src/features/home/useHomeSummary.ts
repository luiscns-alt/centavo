import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { todayISO } from '../../core/db'
import { HOME_SUMMARY_VERSION, loadHomeSummary, type HomeSummary } from './home'

const SNAPSHOT_KEY = 'centavo:homeSnapshot'
interface Snapshot { scope: string; data: HomeSummary }

function readSnapshot(): Snapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null') as Snapshot | null
    return s && s.data?.version === HOME_SUMMARY_VERSION ? s : null
  } catch { return null }
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
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ scope: scopeKey, data: live } satisfies Snapshot)) } catch { /* full or private */ }
  }, [live, scopeKey])

  if (live) return { data: live, stale: false }
  const usable = snapshot && snapshot.scope === scopeKey && snapshot.data.asOf === todayISO()
  return { data: usable ? snapshot.data : undefined, stale: !!usable }
}
