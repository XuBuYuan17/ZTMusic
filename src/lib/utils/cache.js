import { getStorageJson, removeStorage, setStorage } from './storage.js'

const CACHE_PREFIX = 'ncm_cache:'
const CACHE_INDEX_KEY = 'ncm_cache_index'
const MAX_CACHE_ENTRIES = 120

function now() {
  return Date.now()
}

function hashText(text) {
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index)
  }
  return (hash >>> 0).toString(36)
}

function cacheKey(key) {
  return `${CACHE_PREFIX}${hashText(key)}`
}

function getIndex() {
  return getStorageJson(CACHE_INDEX_KEY, [])
}

function setIndex(index) {
  setStorage(CACHE_INDEX_KEY, index.slice(0, MAX_CACHE_ENTRIES))
}

function touchIndex(storageKey) {
  const nextIndex = [storageKey, ...getIndex().filter(item => item !== storageKey)]
  const overflow = nextIndex.slice(MAX_CACHE_ENTRIES)
  overflow.forEach(removeStorage)
  setIndex(nextIndex)
}

export function createCacheKey(parts) {
  return JSON.stringify(parts)
}

export function readCache(key, { allowExpired = false } = {}) {
  const storageKey = cacheKey(key)
  const entry = getStorageJson(storageKey, null)
  if (!entry || !entry.expiresAt) return null
  if (!allowExpired && entry.expiresAt < now()) return null
  touchIndex(storageKey)
  return entry.value
}

export function writeCache(key, value, ttl) {
  if (!ttl || ttl <= 0 || value === undefined) return
  const storageKey = cacheKey(key)
  setStorage(storageKey, {
    expiresAt: now() + ttl,
    savedAt: now(),
    value,
  })
  touchIndex(storageKey)
}

export function clearCache() {
  getIndex().forEach(removeStorage)
  removeStorage(CACHE_INDEX_KEY)
}

export function getCacheStats() {
  try {
    const index = getIndex()
    const bytes = index.reduce((total, storageKey) => {
      const value = localStorage.getItem(storageKey)
      return total + (value ? new Blob([value]).size : 0)
    }, 0)

    return { entries: index.length, bytes }
  } catch {
    return { entries: 0, bytes: 0 }
  }
}