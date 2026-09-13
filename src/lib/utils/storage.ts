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
