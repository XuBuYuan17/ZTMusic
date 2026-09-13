/**
 * 预取管理
 *
 * 职责：后台预取下一首歌的 URL 和音频，实现切歌零等待。
 * 独立于播放状态管理，接收必要的上下文参数。
 */

import { musicService } from '../music/service.ts'
import { getNextIndex, type ShuffleState } from './queue.ts'
import { dbCache } from '../db/cache.ts'
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
  let lastPrefetch: { id: SongId; urls: string[]; time: number; source?: string; level?: string } | null = null

  function trimCache(): void {
    while (prefetchCache.size > LIMITS.MAX_PREFETCH) {
      const firstKey = prefetchCache.keys().next().value
      if (firstKey === undefined) break
      prefetchCache.delete(firstKey)
    }
  }

  function setCachedUrls(id: SongId, urls: unknown, meta: Record<string, unknown> = {}): string[] | null {
    if (!id || !Array.isArray(urls) || urls.length === 0) return null
    const normalizedUrls = [...new Set(urls.map(normalizePlayUrl).filter(Boolean))]
    if (normalizedUrls.length === 0) return null
    prefetchCache.set(id, normalizedUrls)
    trimCache()
    lastPrefetch = {
      id,
      urls: normalizedUrls,
      time: Date.now(),
      ...meta,
    }
    return normalizedUrls
  }

  function clear(): void {
    activePrefetchId += 1
    prefetchCache.clear()
    lastPrefetch = null
  }

  async function preloadCachedUrl(nextTrack: PrefetchTrack, preload?: (url: string) => void): Promise<PrefetchHit | null> {
    const cachedUrls = await dbCache.urlGet(nextTrack.id).catch(() => null)
    const firstUrl = Array.isArray(cachedUrls) ? normalizePlayUrl(cachedUrls[0]) : ''
    if (!firstUrl) return null
    const urls = setCachedUrls(nextTrack.id, cachedUrls, { source: 'db-cache' })
    if (!urls) return null
    debugLog('prefetch', 'cache-hit', { id: nextTrack.id, urlCount: urls.length })
    preload?.(firstUrl)
    return { id: nextTrack.id, urls, source: 'db-cache' }
  }

  /**
   * 后台预取下一首歌的 URL + 音频
   */
  async function prefetchNextTrackUrl(options: PrefetchOptions = {}): Promise<PrefetchHit | null> {
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
    if (queue.length < 2 || queueIndex < 0 || isStale()) return null

    // peek 而已：不推进洗牌指针，切歌由 player.next() 负责 commit
    const nextIdx = getNextIndex({ currentIndex: queueIndex, queueLength: queue.length, mode, shuffleState })
    if (nextIdx < 0 || nextIdx === queueIndex) return null
    const nextTrack = queue[nextIdx]
    if (!nextTrack?.id) return null
    if (nextTrack.source === 'local' || nextTrack.source === 'webdav') return null

    const memoryUrls = prefetchCache.get(nextTrack.id)
    const memoryUrl = memoryUrls?.[0]
    if (memoryUrl) {
      debugLog('prefetch', 'memory-hit', { id: nextTrack.id, nextIdx })
      preload?.(memoryUrl)
      return null
    }

    debugLog('prefetch', 'start', { id: nextTrack.id, nextIdx, mode, preferredLevel, reqId })

    const cachedResult = await preloadCachedUrl(nextTrack, preload)
    if (cachedResult || isStale() || prefetchId !== activePrefetchId) return null

    const tiers = uniqueLevels(['standard', 'higher', preferredLevel])
    for (const level of tiers) {
      if (isStale() || prefetchId !== activePrefetchId) return null
      try {
        const candidate = await musicService.getStream(nextTrack.id, { level, unblock: false })
        const urlStr = normalizePlayUrl(candidate?.url)
        if (!urlStr) continue
        // 复检：await 期间用户可能切歌，避免把过期的下一首预加载到 engine
        if (isStale() || prefetchId !== activePrefetchId) return null

        const urls = setCachedUrls(nextTrack.id, [urlStr], { source: 'network', level })
        if (!urls) continue
        debugLog('prefetch', 'network-cached', { id: nextTrack.id, level, url: urlStr })
        dbCache.urlSet(nextTrack.id, urls).catch((err: unknown) => swallowError('Prefetch.urlSet', err))
        preload?.(urlStr)
        return null
      } catch (err) {
        debugLog('prefetch', 'level-failed', { id: nextTrack.id, level, message: err instanceof Error ? err.message : String(err) })
      }
    }

    debugLog('prefetch', 'miss', { id: nextTrack.id, reqId })
    return null
  }

  return {
    cache: prefetchCache,
    prefetchNextTrackUrl,
  }
}
