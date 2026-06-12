export function getStorage(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

export function setStorage(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  } catch {}
}

export function getStorageJson(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(key)
  } catch {}
}