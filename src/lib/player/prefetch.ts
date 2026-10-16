/**
 * 预取管理
 *
 * 职责：后台预取下一首歌的 URL 和音频，实现切歌零等待。
 * 独立于播放状态管理，接收必要的上下文参数。
 */

import { musicService } from '../music/service.ts'
import { getNextIndex, type ShuffleState } from './queue.ts'
import { dbCache, attachUrlCacheMetadata, getUrlCacheContext, getUrlCacheMetadata, type SongUrlCacheEntry, type UrlCacheContext } from '../db/cache.ts'
import { LIMITS } from '../utils/constants.ts'
import { debugLog, swallowError } from '../utils/error.ts'
import type { PlayMode } from '../types/player.ts'
import type { SongId, TrackSource } from '../types/music.ts'

function uniqueLevels(levels: string[]): string[] {
  return [...new Set(levels.filter(Boolean))]
}

function normalizePlayUrl(url: unknown): string {
  if (!url || typeof url !== 'string') return ''
  return url.trim().replace(/^http:\/\/([^/?#]+\.music\.126\.net)([/?#]|$)/i, 'https://$1$2')
}

export interface PrefetchTrack {
  id: SongId
  source?: TrackSource
}

export interface PrefetchOptions {
  queue?: readonly PrefetchTrack[]
  queueIndex?: number
  mode?: PlayMode
  preferredLevel?: string
  reqId?: number
  isStale?: () => boolean
  preload?: (url: string) => void
  shuffleState?: ShuffleState | null
  signal?: AbortSignal
}

export interface PrefetchHit {
  id: SongId
  urls: string[]
  source: string
}

export interface PrefetchManager {
  cache: Map<SongId, string[]>
  prefetchNextTrackUrl(options?: PrefetchOptions): Promise<PrefetchHit | null>
}

/** 创建预取缓存管理器 */
export function createPrefetchManager(): PrefetchManager {
  const prefetchCache = new Map<SongId, string[]>()
  let activePrefetchId = 0
  let activeController: AbortController | null = null

  function trimCache(): void {
    while (prefetchCache.size > LIMITS.MAX_PREFETCH) {
      const firstKey = prefetchCache.keys().next().value
      if (firstKey === undefined) break
      prefetchCache.delete(firstKey)
    }
  }

  function setCachedUrls(id: SongId, entry: SongUrlCacheEntry): string[] | null {
    const urls = entry.urls
    if (!id || !Array.isArray(urls) || urls.length === 0) return null
    const normalizedUrls = [...new Set(urls.map(normalizePlayUrl).filter(Boolean))]
    if (normalizedUrls.length === 0) return null
    attachUrlCacheMetadata(normalizedUrls, { ...entry, urls: normalizedUrls, candidates: entry.candidates.map(candidate => ({ ...candidate, url: normalizePlayUrl(candidate.url) })) })
    prefetchCache.set(id, normalizedUrls)
    trimCache()
    return normalizedUrls
  }

  async function preloadCachedUrl(nextTrack: PrefetchTrack, context: UrlCacheContext, isStale: () => boolean, preload?: (url: string) => void): Promise<PrefetchHit | null> {
    const entry = await dbCache.urlGetEntry(nextTrack.id, context).catch(() => null)
    if (isStale() || !entry) return null
    const firstUrl = normalizePlayUrl(entry.urls[0])
    if (!firstUrl) return null
    const urls = setCachedUrls(nextTrack.id, entry)
    if (!urls) return null
    debugLog('prefetch', 'cache-hit', { id: nextTrack.id, urlCount: urls.length })
    preload?.(firstUrl)
    return { id: nextTrack.id, urls, source: 'db-cache' }
  }

  /**
   * 后台预取下一首歌的 URL + 音频
   */
  async function prefetchNextTrackUrl(options: PrefetchOptions = {}): Promise<PrefetchHit | null> {
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    const onAbort = () => controller.abort(options.signal?.reason)
    if (options.signal?.aborted) onAbort()
    else options.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const {
        queue = [],
        queueIndex = -1,
        mode = 'list',
        preferredLevel = 'standard',
        reqId = 0,
        isStale = () => false,
        preload,
        shuffleState = null,
      } = options

      const prefetchId = ++activePrefetchId
      const context = await getUrlCacheContext()
      const isPrefetchStale = () => isStale() || prefetchId !== activePrefetchId || controller.signal.aborted || !context.isCurrent()
      if (!context.namespace || queue.length < 2 || queueIndex < 0 || isPrefetchStale()) return null

      // peek 而已：不推进洗牌指针，切歌由 player.next() 负责 commit
      const nextIdx = getNextIndex({ currentIndex: queueIndex, queueLength: queue.length, mode, shuffleState })
      if (nextIdx < 0 || nextIdx === queueIndex) return null
      const nextTrack = queue[nextIdx]
      if (!nextTrack?.id) return null
      if (nextTrack.source === 'local' || nextTrack.source === 'webdav') return null

      const memoryUrls = prefetchCache.get(nextTrack.id)
      const memoryUrl = memoryUrls?.[0]
      const memoryEntry = memoryUrls ? getUrlCacheMetadata(memoryUrls) : null
      if (memoryUrl && memoryEntry?.namespace === context.namespace && memoryEntry.expiresAt > Date.now()) {
        debugLog('prefetch', 'memory-hit', { id: nextTrack.id, nextIdx })
        preload?.(memoryUrl)
        return null
      }
      prefetchCache.delete(nextTrack.id)

      debugLog('prefetch', 'start', { id: nextTrack.id, nextIdx, mode, preferredLevel, reqId })

      const cachedResult = await preloadCachedUrl(nextTrack, context, isPrefetchStale, preload)
      if (cachedResult || isPrefetchStale()) return null

      const tiers = uniqueLevels(['standard', 'higher', preferredLevel])
      for (const level of tiers) {
        if (isPrefetchStale()) return null
        try {
          const candidate = await musicService.getStream(nextTrack.id, { level, unblock: false, signal: controller.signal })
          // 复检：await 期间用户可能切歌，避免把过期的下一首预加载到 engine
          if (isPrefetchStale()) return null
          const urlStr = normalizePlayUrl(candidate?.url)
          if (!urlStr || candidate.isTrial || candidate.cacheable === false) continue

          const entry = await dbCache.urlSetEntry(nextTrack.id, [{ ...candidate, url: urlStr, level: candidate.level || level }], { context, preserveHigherQuality: true, isActive: () => !isPrefetchStale() })
            .catch((err: unknown) => { swallowError('Prefetch.urlSet', err); return null })
          if (isPrefetchStale()) return null
          const urls = setCachedUrls(nextTrack.id, entry ?? {
            namespace: context.namespace, urls: [urlStr], candidates: [{ url: urlStr, level: candidate.level || level, source: candidate.source }], expiresAt: Date.now() + 60 * 60 * 1000,
          })
          if (!urls) continue
          debugLog('prefetch', 'network-cached', { id: nextTrack.id, level, url: urlStr })
          preload?.(urls[0]!)
          return null
        } catch (err) {
          debugLog('prefetch', 'level-failed', { id: nextTrack.id, level, message: err instanceof Error ? err.message : String(err) })
        }
      }

      debugLog('prefetch', 'miss', { id: nextTrack.id, reqId })
      return null
    } finally {
      options.signal?.removeEventListener('abort', onAbort)
    }
  }

  return {
    cache: prefetchCache,
    prefetchNextTrackUrl,
  }
}
