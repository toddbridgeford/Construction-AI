const DB_NAME = 'construction-ai-api-cache'
const STORE_NAME = 'responses'
const DB_VERSION = 1

export type CacheRecord<T> = {
  key: string
  value: T
  updatedAt: number
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export async function readCacheRecord<T>(key: string): Promise<CacheRecord<T> | null> {
  if (!('indexedDB' in window)) return null
  const db = await openDb()
  return new Promise<CacheRecord<T> | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve((req.result as CacheRecord<T> | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function readCache<T>(key: string, maxAgeMs = 1000 * 60 * 60 * 6): Promise<T | null> {
  const record = await readCacheRecord<T>(key)
  if (!record) return null
  if (Date.now() - record.updatedAt > maxAgeMs) return null
  return record.value
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  if (!('indexedDB' in window)) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ key, value, updatedAt: Date.now() } satisfies CacheRecord<T>)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
