export interface LruCacheOptions {
  maxEntries?: number
  ttlMs?: number
  now?: () => number
}

export interface LruCache<V> {
  get(key: unknown): V | null
  age(key: unknown): number | null
  set(key: unknown, value: V): V
  clear(key?: unknown): void
}

interface Entry<V> {
  value: V
  createdAt: number
}

export function createLruCache<V = unknown>({
  maxEntries = 24,
  ttlMs = 5 * 60 * 1000,
  now = Date.now,
}: LruCacheOptions = {}): LruCache<V> {
  const entries = new Map<unknown, Entry<V>>()

  function readEntry(key: unknown): Entry<V> | null {
    const entry = entries.get(key)
    if (!entry) return null
    if (now() - entry.createdAt > ttlMs) {
      entries.delete(key)
      return null
    }
    return entry
  }

  function get(key: unknown): V | null {
    const entry = readEntry(key)
    if (!entry) return null
    entries.delete(key)
    entries.set(key, entry)
    return entry.value
  }

  function age(key: unknown): number | null {
    const entry = readEntry(key)
    return entry ? Math.max(0, now() - entry.createdAt) : null
  }

  function set(key: unknown, value: V): V {
    entries.delete(key)
    entries.set(key, { value, createdAt: now() })
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
    return value
  }

  function clear(key?: unknown): void {
    if (key !== undefined) entries.delete(key)
    else entries.clear()
  }

  return { get, age, set, clear }
}
