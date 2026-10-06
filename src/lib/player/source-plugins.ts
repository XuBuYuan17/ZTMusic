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
  if (!raw) throw new TypeError('音源插件需要解析地址')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new TypeError('音源插件地址无效')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('音源插件仅支持 http/https 地址')
  }
  if (url.username || url.password) {
    throw new TypeError('音源插件地址不能包含用户名或密码')
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
  const id = String(input.id || '').trim().toLowerCase()
  const name = String(input.name || '').trim()
  if (!PLUGIN_ID_PATTERN.test(id) || !name) return null
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

export function listSourcePlugins(): PlaybackSourcePlugin[] {
  const store = storage()
  if (!store) return []
  try {
    const parsed = JSON.parse(store.getItem(SOURCE_PLUGIN_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, index) => normalizePlugin(item as Partial<PlaybackSourcePlugin>, index))
      .filter((item): item is PlaybackSourcePlugin => item !== null)
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export function saveSourcePlugins(plugins: PlaybackSourcePlugin[]): PlaybackSourcePlugin[] {
  const normalized = plugins
    .map((item, index) => normalizePlugin({ ...item, priority: index }, index))
    .filter((item): item is PlaybackSourcePlugin => item !== null)
  storage()?.setItem(SOURCE_PLUGIN_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function createSourcePlugin(input: { name: string; endpoint: string }): PlaybackSourcePlugin {
  const existing = listSourcePlugins()
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
  if (!plugin) throw new TypeError('音源插件配置无效')
  saveSourcePlugins([...existing, plugin])
  return plugin
}

export function updateSourcePlugin(id: string, patch: Partial<PlaybackSourcePlugin>): PlaybackSourcePlugin[] {
  const plugins = listSourcePlugins()
  const next = plugins.map(plugin => plugin.id === id ? { ...plugin, ...patch, id: plugin.id } : plugin)
  return saveSourcePlugins(next)
}

export function removeSourcePlugin(id: string): PlaybackSourcePlugin[] {
  return saveSourcePlugins(listSourcePlugins().filter(plugin => plugin.id !== id))
}

export function moveSourcePlugin(id: string, delta: -1 | 1): PlaybackSourcePlugin[] {
  const plugins = listSourcePlugins()
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
      const url = new URL(value)
      if ((url.protocol === 'https:' || url.protocol === 'http:') && !urls.includes(url.toString())) {
        urls.push(url.toString())
      }
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
  const controller = new AbortController()
  const onAbort = () => controller.abort(parentSignal?.reason)
  parentSignal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('source plugin timeout')), plugin.timeoutMs)

  try {
    const response = await fetchImpl(plugin.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        protocol: 'zt-playback-resolver',
        version: SOURCE_PLUGIN_PROTOCOL_VERSION,
        track: request,
      }),
      signal: controller.signal,
    })
    if (!response.ok) return []
    const result = asUrlList(await response.json())
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
  { signal, fetchImpl = fetch, stopAfterFirst = true }: ResolveSourcePluginOptions = {},
): Promise<SourcePluginCandidate[]> {
  const plugins = listSourcePlugins().filter(plugin => plugin.enabled)
  const candidates: SourcePluginCandidate[] = []
  for (const plugin of plugins) {
    if (signal?.aborted) break
    const resolved = await resolveOne(plugin, request, fetchImpl, signal)
    for (const candidate of resolved) {
      if (!candidates.some(item => item.url === candidate.url)) candidates.push(candidate)
    }
    if (stopAfterFirst && resolved.length > 0) break
  }
  return candidates
}
