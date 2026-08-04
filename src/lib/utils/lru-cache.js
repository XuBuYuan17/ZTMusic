export function createLruCache({ maxEntries = 24, ttlMs = 5 * 60 * 1000, now = Date.now } = {}) {
  const entries = new Map()

  function get(key) {
    const entry = entries.get(key)
    if (!entry) return null
    if (now() - entry.createdAt > ttlMs) {
      entries.delete(key)
      return null
    }
    entries.delete(key)
    entries.set(key, entry)
    return entry.value
  }

  function set(key, value) {
    entries.delete(key)
    entries.set(key, { value, createdAt: now() })
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
    return value
  }

  function clear(key) {
    if (key !== undefined) entries.delete(key)
    else entries.clear()
  }

  return { get, set, clear }
}
