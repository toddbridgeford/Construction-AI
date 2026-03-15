import { useEffect, useState, type DependencyList } from 'react'
import type { ApiEnvelope } from '@/api/contracts'
import type { HookResourceState } from './types'

export function useApiResource<T>(loader: () => Promise<ApiEnvelope<T>>, deps: DependencyList): HookResourceState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [freshness, setFreshness] = useState<HookResourceState<T>['freshness']>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    loader()
      .then((payload) => {
        if (!alive) return
        setData(payload.data)
        setFreshness(payload.freshness)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'Unable to load resource')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, freshness }
}
