import { useEffect, useState, type DependencyList } from 'react'

type ResourceState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApiResource<T>(loader: () => Promise<T>, deps: DependencyList): ResourceState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    loader()
      .then((payload) => {
        if (!alive) return
        setData(payload)
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

  return { data, loading, error }
}
