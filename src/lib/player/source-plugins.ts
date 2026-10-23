import type { SongId } from '../types/music.ts'

export const SOURCE_PLUGIN_STORAGE_KEY = 'playback_source_plugins_v1'
export const SOURCE_PLUGIN_PROTOCOL_VERSION = 1

export interface PlaybackSourcePlugin {
  id: string
  name: string
  endpoint: string
  enabled: boolean
  priority: number
  timeoutMs: number
}

export interface SourcePluginResolveRequest {
  providerId: string
  sourceId: SongId
  quality: string
  title?: string
  artists?: string[]
  album?: string
  durationMs?: number
}

export interface SourcePluginCandidate {
  url: string
  pluginId: string
  pluginName: string
  level?: string
  cacheable: false
}

export interface ResolveSourcePluginOptions {
  signal?: AbortSignal
  isStale?: () => boolean
  fetchImpl?: typeof fetch
  stopAfterFirst?: boolean
}

const DEFAULT_TIMEOUT_MS = 2500
const MIN_TIMEOUT_MS = 500
const MAX_TIMEOUT_MS = 10000
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function normalizeEndpoint(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) throw new TypeError('sourcePlugins.endpointRequired')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new TypeError('sourcePlugins.invalidEndpoint')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('sourcePlugins.httpOnly')
  }
  if (url.username || url.password) {
    throw new TypeError('sourcePlugins.noCredentials')
  }
  url.hash = ''
  return url.toString()
}

function normalizeTimeout(value: unknown): number {
  const timeout = Number(value)
  if (!Number.isFinite(timeout)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(timeout)))
}

function normalizePlugin(input: Partial<PlaybackSourcePlugin>, index = 0): PlaybackSourcePlugin | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (typeof input.id !== 'string' || typeof input.name !== 'string' || typeof input.endpoint !== 'string') return null
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') return null
  const id = String(input.id || '').trim().toLowerCase()
  const name = String(input.name || '').trim()
  if (!PLUGIN_ID_PATTERN.test(id) || !name || name.length > 64) return null
  try {
    return {
      id,
      name,
      endpoint: normalizeEndpoint(input.endpoint),
      enabled: input.enabled !== false,
      priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : index,
      timeoutMs: normalizeTimeout(input.timeoutMs),
    }
  } catch {
    return null
  }
}

export function listSourcePlugins(strict = false): PlaybackSourcePlugin[] {
  const store = storage()
  if (!store) {
    if (strict) throw new Error('sourcePlugins.storageUnavailable')
    return []
  }
  try {
    const parsed = JSON.parse(store.getItem(SOURCE_PLUGIN_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) throw new TypeError('sourcePlugins.invalidConfig')
    const ids = new Set<string>()
    return parsed
      .map((item, index) => normalizePlugin(item as Partial<PlaybackSourcePlugin>, index))
      .filter((item): item is PlaybackSourcePlugin => {
        if (!item || ids.has(item.id)) return false
        ids.add(item.id)
        return true
      })
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
  } catch {
    if (strict) throw new Error('sourcePlugins.loadFailed')
    return []
  }
}

export function saveSourcePlugins(plugins: PlaybackSourcePlugin[]): PlaybackSourcePlugin[] {
  const normalized = plugins
    .map((item, index) => normalizePlugin({ ...item, priority: index }, index))
    .map(item => {
      if (!item) throw new TypeError('sourcePlugins.invalidConfig')
      return item
    })
  const store = storage()
  if (!store) throw new Error('sourcePlugins.storageUnavailable')
  try {
    store.setItem(SOURCE_PLUGIN_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    throw new Error('sourcePlugins.saveFailed')
  }
  return normalized
}

export function createSourcePlugin(input: { name: string; endpoint: string }): PlaybackSourcePlugin {
  const existing = listSourcePlugins(true)
  const base = String(input.name || 'source')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'source'
  let id = `plugin-${base}`
  let suffix = 2
  while (existing.some(item => item.id === id)) id = `plugin-${base}-${suffix++}`
  const plugin = normalizePlugin({
    id,
    name: input.name,
    endpoint: input.endpoint,
    enabled: true,
    priority: existing.length,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  })
  if (!plugin) throw new TypeError('sourcePlugins.invalidConfig')
  saveSourcePlugins([...existing, plugin])
  return plugin
}

export function updateSourcePlugin(id: string, patch: Partial<PlaybackSourcePlugin>): PlaybackSourcePlugin[] {
  const plugins = listSourcePlugins(true)
  const next = plugins.map(plugin => plugin.id === id ? { ...plugin, ...patch, id: plugin.id } : plugin)
  return saveSourcePlugins(next)
}

export function removeSourcePlugin(id: string): PlaybackSourcePlugin[] {
  return saveSourcePlugins(listSourcePlugins(true).filter(plugin => plugin.id !== id))
}

export function moveSourcePlugin(id: string, delta: -1 | 1): PlaybackSourcePlugin[] {
  const plugins = listSourcePlugins(true)
  const index = plugins.findIndex(plugin => plugin.id === id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= plugins.length) return plugins
  const next = [...plugins]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  return saveSourcePlugins(next)
}

function asUrlList(payload: unknown): { urls: string[]; level?: string } {
  if (!payload || typeof payload !== 'object') return { urls: [] }
  const record = payload as Record<string, unknown>
  const rawUrls = Array.isArray(record.urls)
    ? record.urls
    : typeof record.url === 'string'
      ? [record.url]
      : []
  const urls: string[] = []
  for (const value of rawUrls) {
    if (typeof value !== 'string') continue
    try {
      const url = normalizeEndpoint(value)
      if (!urls.includes(url)) urls.push(url)
    } catch { /* invalid provider response */ }
  }
  return { urls, level: typeof record.level === 'string' ? record.level : undefined }
}

async function resolveOne(
  plugin: PlaybackSourcePlugin,
  request: SourcePluginResolveRequest,
  fetchImpl: typeof fetch,
  parentSignal?: AbortSignal,
): Promise<SourcePluginCandidate[]> {
  if (parentSignal?.aborted) return []
  const controller = new AbortController()
  const onAbort = () => controller.abort(parentSignal?.reason)
  parentSignal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('source plugin timeout')), plugin.timeoutMs)

  try {
    const response = await fetchImpl(plugin.endpoint, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        protocol: 'zt-playback-resolver',
        version: SOURCE_PLUGIN_PROTOCOL_VERSION,
        track: request,
      }),
      signal: controller.signal,
    })
    if (controller.signal.aborted || !response.ok) return []
    const result = asUrlList(await response.json())
    if (controller.signal.aborted) return []
    return result.urls.map(url => ({
      url,
      pluginId: plugin.id,
      pluginName: plugin.name,
      level: result.level,
      cacheable: false as const,
    }))
  } catch {
    return []
  } finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', onAbort)
  }
}

/**
 * 按设置中的优先级顺序调用用户自行配置的音源插件。
 *
 * ZTMusic 不内置第三方公共解析服务地址；插件 endpoint 必须由用户自行部署
 * 或在得到服务提供者授权后配置。外部 URL 默认不进入持久缓存。
 */
export async function resolveWithSourcePlugins(
  request: SourcePluginResolveRequest,
  { signal, isStale = () => false, fetchImpl = fetch, stopAfterFirst = true }: ResolveSourcePluginOptions = {},
): Promise<SourcePluginCandidate[]> {
  const plugins = listSourcePlugins().filter(plugin => plugin.enabled)
  const candidates: SourcePluginCandidate[] = []
  for (const plugin of plugins) {
    if (signal?.aborted || isStale()) return []
    const resolved = await resolveOne(plugin, request, fetchImpl, signal)
    if (signal?.aborted || isStale()) return []
    for (const candidate of resolved) {
      if (!candidates.some(item => item.url === candidate.url)) candidates.push(candidate)
    }
    if (stopAfterFirst && resolved.length > 0) break
  }
  return candidates
}
