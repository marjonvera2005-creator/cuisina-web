import { useCallback, useEffect, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { errorMessage } from './supabase'

// Remembers the last result of each query while the tab is open, so going back to a page shows
// its data at once (no "Loading…") and quietly refreshes it in the background.
const cache = new Map<string, unknown>()
export function clearQueryCache() { cache.clear() }

/** Runs an async loader whenever `deps` change; `reload()` refetches without clearing current data. */
export function useQuery<T>(loader: () => Promise<T>, deps: unknown[]) {
  const key = loader.toString() + '|' + JSON.stringify(deps)
  const keyRef = useRef(key)
  keyRef.current = key
  const [data, setDataState] = useState<T | null>(() => (cache.get(key) as T | undefined) ?? null)
  const [loading, setLoading] = useState(!cache.has(key))
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (cache.has(key)) setDataState(cache.get(key) as T)
    setLoading(true)
    loader()
      .then(result => { if (!cancelled) { cache.set(key, result); setDataState(result); setError('') } })
      .catch(err => { if (!cancelled) setError(errorMessage(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick])

  const reload = useCallback(() => setTick(value => value + 1), [])
  const setData = useCallback((value: SetStateAction<T | null>) => {
    setDataState(previous => {
      const next = typeof value === 'function' ? (value as (p: T | null) => T | null)(previous) : value
      if (next === null) cache.delete(keyRef.current); else cache.set(keyRef.current, next)
      return next
    })
  }, [])
  return { data, loading, error, reload, setData }
}
