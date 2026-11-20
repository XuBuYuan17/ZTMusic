export function getStorage(key: string, fallback: string = ''): string {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

export function setStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  } catch {}
}

export function getStorageJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {}
}

export function readPageSnapshot<T>(key: string, scope: string): T | null {
  const snapshot = getStorageJson<{ scope: string; savedAt: number; data: T } | null>(key, null)
  if (!snapshot || snapshot.scope !== scope || !Number.isFinite(snapshot.savedAt)) return null
  const age = Date.now() - snapshot.savedAt
  return age >= 0 && age < 24 * 60 * 60 * 1000 ? snapshot.data ?? null : null
}

export function savePageSnapshot<T>(key: string, scope: string, data: T): void {
  setStorage(key, { scope, savedAt: Date.now(), data })
}
