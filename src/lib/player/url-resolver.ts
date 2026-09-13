/**
 * URL 获取与 Fallback 链
 *
 * 职责：获取歌曲的可播放 URL，支持多级音质、缓存、unblock 和 fallback。
 * 不涉及播放状态管理，只负责 URL 的获取和排序。
 *
 * URL 获取策略：
 *   1. 检查预取缓存（内存，当前歌单的下一首）
 *   2. 检查 IndexedDB 持久缓存（跨会话）
 *   3. Phase 1 — 快速出声（standard / higher / 用户偏好）
 *   4. Phase 2 — unblock 尝试
 *   5. 官方 fallback URL 兜底
 *   6. 后台填充更多音质（fillFallbackUrls）
 */

import { musicService } from '../music/service.ts'
import { dbCache } from '../db/cache.ts'
import { QUALITY_ORDER, PLAYBACK, FALLBACK_URL_TEMPLATE } from '../utils/constants.ts'
import { swallowError } from '../utils/logging.ts'
import type { SongId } from '../types/music.ts'

// ===== 日志工具 =====

const SHOULD_LOG_PLAY_URLS = typeof import.meta !== 'undefined' && import.meta.env?.DEV

function shouldDebugPlayback(): boolean {
  return Boolean(SHOULD_LOG_PLAY_URLS) || (typeof localStorage !== 'undefined' && localStorage.getItem('debug_playback') === 'true')
}

function logPlayUrlAttempt(type: string, payload: unknown): void {
  if (!shouldDebugPlayback() || typeof console === 'undefined') return
  console.debug(`[play-url:${type}]`, payload)
}

function logPlayback(type: string, payload: unknown = {}): void {
  if (!shouldDebugPlayback() || typeof console === 'undefined') return
  console.debug(`[playback:${type}]`, payload)
}

// ===== 工具函数 =====

function normalizePlayUrl(url: unknown): string {
  if (!url || typeof url !== 'string') return ''
  return url.trim().replace(/^http:\/\/([^/?#]+\.music\.126\.net)([/?#]|$)/i, 'https://$1$2')
}

function addUrl(urls: string[], urlOrObj: string | { url?: string } | null | undefined): void {
  if (!urlOrObj) return
  const playableUrl = typeof urlOrObj === 'string' ? urlOrObj : urlOrObj.url
  if (playableUrl && !urls.includes(playableUrl)) urls.push(playableUrl)
}

interface UrlCandidate {
  url: string
  isTrial?: boolean
  source: string
  level?: string
  cacheable: boolean
}

function addCandidate(candidates: UrlCandidate[], candidate: UrlCandidate | null | undefined): void {
  if (!candidate?.url || candidates.some(item => item.url === candidate.url)) return
  candidates.push(candidate)
}

function withTimeout<T>(promise: Promise<T>, timeout: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let onAbort: (() => void) | null = null
  const cleanup = () => {
    if (timer !== null) { clearTimeout(timer); timer = null }
    if (onAbort && signal) { signal.removeEventListener('abort', onAbort); onAbort = null }
  }
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('play url timeout')), timeout)
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
  return Promise.race([promise, timeoutPromise]).finally(cleanup)
}

function uniqueLevels(levels: string[]): string[] {
  return [...new Set(levels.filter(Boolean))]
}

// ===== 音质排序 =====

/** 根据用户偏好排序音质优先级 */
function orderedPlayLevels(preferredLevel: string): string[] {
  const levels = [...QUALITY_ORDER]
  const prefIdx = levels.indexOf(preferredLevel)
  if (prefIdx > 0) {
    levels.splice(prefIdx, 1)
    levels.unshift(preferredLevel)
  }
  return levels
}

/** 检查 level 是否比 baseLevel 音质更好 */
function isBetterThanLevel(level: string, baseLevel: string): boolean {
  if (!baseLevel) return true
  const cleanBase = baseLevel.replace('+unblock', '')
  const idx1 = QUALITY_ORDER.indexOf(level)
  const idx2 = QUALITY_ORDER.indexOf(cleanBase)
  if (idx1 === -1 || idx2 === -1) return false
  return idx1 < idx2 // 索引越小音质越好
}

// ===== 核心 API =====

/** 登录态钩子：无音源时复查 cookie 是否失效 */
export interface AuthHooks {
  isLoggedIn?: boolean
  checkLoginStatus?: () => boolean | Promise<boolean>
}

async function fetchSongUrl(
  id: SongId,
  level: string,
  unblock: boolean,
  timeout: number,
  authOpts: AuthHooks = {},
  signal?: AbortSignal,
): Promise<UrlCandidate | null> {
  try {
    const item = await withTimeout(musicService.getStream(id, { level, unblock }), timeout, signal)
    logPlayUrlAttempt('result', {
      id,
      level,
      unblock,
      code: item?.code,
      hasUrl: Boolean(item?.url),
      freeTrial: Boolean(item?.isTrial),
      message: item?.message || '',
    })
    if (!item?.url) {
      // 已登录但无音源 → cookie 可能已过期，等待检查结果
      if (authOpts.isLoggedIn) {
        const stillValid = await authOpts.checkLoginStatus?.()
        if (!stillValid) {
          // cookie 已过期并被清除，返回 null 让调用方走 fallback
          logPlayback('auth-cleared-on-no-url', { id, level })
        }
      }
      return null
    }
    if (item.isTrial && authOpts.isLoggedIn) {
      logPlayback('vip-trial', { id, level, url: item.url?.slice(0, 50) })
    }
    return {
      url: normalizePlayUrl(item.url),
      isTrial: Boolean(item?.isTrial),
      source: item?.source || (unblock ? 'official-unblock' : 'official'),
      level: item?.level || level,
      cacheable: item?.cacheable !== false,
    }
  } catch (error) {
    logPlayUrlAttempt('error', {
      id,
      level,
      unblock,
      message: error instanceof Error ? error.message : 'play url request failed',
    })
    return null
  }
}

async function fetchMatchedSongUrl(id: SongId, timeout: number, signal?: AbortSignal): Promise<UrlCandidate | null> {
  try {
    const candidate = await withTimeout(musicService.getMatchedStream(id), timeout, signal)
    const url = candidate?.url || ''
    if (!url) return null
    const normalized = normalizePlayUrl(url)
    logPlayback('match-url', { id, url: normalized })
    return normalized ? { url: normalized, source: 'match', cacheable: true } : null
  } catch (error) {
    logPlayUrlAttempt('match-error', {
      id,
      message: error instanceof Error ? error.message : 'match url request failed',
    })
    return null
  }
}

async function fetchOldSongUrl(id: SongId, timeout: number, signal?: AbortSignal): Promise<UrlCandidate | null> {
  try {
    const candidate = await withTimeout(musicService.getLegacyStream(id, 320000), timeout, signal)
    const url = candidate?.url || ''
    if (!url) return null
    const normalized = normalizePlayUrl(url)
    logPlayback('old-api-fallback', { id, url: normalized })
    return normalized ? { url: normalized, source: 'old-api', cacheable: false } : null
  } catch { /* swallow */ }
  return null
}

// ===== 后台刷新/填充 =====

/** 后台刷新 IndexedDB 中的 URL 缓存（不阻塞播放） */
export async function refreshSongUrlsBg(id: SongId, preferredLevel: string): Promise<void> {
  const fastTiers = uniqueLevels(['standard', 'higher', preferredLevel])
  for (const level of fastTiers) {
    const result = await fetchSongUrl(id, level, false, PLAYBACK.FAST_TIMEOUT, {})
    if (result?.url && !result.isTrial) {
      dbCache.urlSet(id, [result.url]).catch((err) => swallowError('UrlResolver.cacheUrlSet', err))
      return
    }
  }
  for (const level of fastTiers) {
    const result = await fetchSongUrl(id, level, true, PLAYBACK.FAST_TIMEOUT, {})
    if (result?.url) {
      dbCache.urlSet(id, [result.url]).catch((err) => swallowError('UrlResolver.cacheUrlSet', err))
      return
    }
  }
}

export interface QualityUpgradeEvent {
  url: string
  currentTime: number
  urls: string[]
  level: string
}

export interface FillFallbackOptions {
  /** 已有 URL 列表 */
  currentUrls?: string[]
  /** 首条 URL 的音质等级 */
  firstUrlLevel?: string
  preferredLevel?: string
  /** 当前是否正在播放 */
  isPlaying?: boolean
  /** 当前播放位置 */
  currentTime?: number
  onQualityUpgrade?: (event: QualityUpgradeEvent) => void
  /** 判断请求是否过期 */
  isStale?: () => boolean
  authOpts?: AuthHooks
  signal?: AbortSignal
}

/** 后台填充更多 fallback URL，返回最新的 URL 列表 */
export async function fillFallbackUrls(
  id: SongId,
  reqId: number,
  options: FillFallbackOptions = {},
): Promise<string[]> {
  const {
    currentUrls = [],
    firstUrlLevel = '',
    preferredLevel = 'standard',
    isPlaying = false,
    currentTime = 0,
    onQualityUpgrade,
    isStale = () => false,
    authOpts = {},
    signal,
  } = options

  const urls = [...currentUrls]
  const allLevels = orderedPlayLevels(preferredLevel)
  let upgraded = false

  // 用于判断请求是否仍有效
  const isActive = () => !isStale()

  // Step 1: 后台获取偏好音质
  for (const level of allLevels) {
    if (!isActive()) return urls
    const result = await fetchSongUrl(id, level, false, PLAYBACK.FALLBACK_TIMEOUT, authOpts, signal)
    if (!result || urls.includes(result.url)) continue

    if (!upgraded && urls.length > 0 && isBetterThanLevel(level, firstUrlLevel)) {
      // 升级到更优音质：仅当未在播放中才无缝切换，否则仅入队
      urls.unshift(result.url)
      upgraded = true
      logPlayback('quality-upgrade', { level, firstUrlLevel, url: result.url })
      if (isPlaying && isActive() && currentTime > 30) {
        // 播放超过 30s 后不再中途切 URL，避免 pop/静音
        logPlayback('quality-upgrade-deferred', { level, currentTime })
      } else if (isPlaying && isActive()) {
        onQualityUpgrade?.({
          url: result.url,
          currentTime,
          urls,
          level,
        })
      }
    } else {
      urls.push(result.url)
    }
  }

  // Step 2: unblock 版本
  for (const level of allLevels) {
    if (!isActive()) return urls
    const result = await fetchSongUrl(id, level, true, PLAYBACK.FALLBACK_TIMEOUT, authOpts, signal)
    if (result && !urls.includes(result.url)) urls.push(result.url)
  }

  // Step 3: UnblockNeteaseMusic 直接解灰
  if (isActive() && urls.length <= 2) {
    const matched = await fetchMatchedSongUrl(id, PLAYBACK.FALLBACK_TIMEOUT, signal)
    if (matched?.url && !urls.includes(matched.url)) urls.push(matched.url)
  }

  // Step 4: 老版 /song/url 兜底
  if (isActive() && urls.length <= 2) {
    const old = await fetchOldSongUrl(id, PLAYBACK.FALLBACK_TIMEOUT, signal)
    if (old?.url && !urls.includes(old.url)) urls.push(old.url)
  }

  // Step 5: 网易官方 fallback
  if (isActive()) {
    const fbUrl = normalizePlayUrl(FALLBACK_URL_TEMPLATE(id))
    if (fbUrl && !urls.includes(fbUrl)) {
      urls.push(fbUrl)
    }
  }

  logPlayback('fallback-urls-filled', { totalUrls: urls.length, id, upgraded })
  return urls
}

export interface PlayableUrlsResult {
  urls: string[]
  firstUrlLevel: string
  isTrial: boolean
}

/**
 * 获取歌曲的可播放 URL 列表（核心入口）
 */
export async function getPlayableUrls(
  id: SongId,
  preferredLevel: string,
  prefetchCache: Map<SongId, string[]> | null | undefined,
  reqId: number,
  authOpts: AuthHooks = {},
  signal?: AbortSignal,
): Promise<PlayableUrlsResult> {
  // 0. 检查预取缓存
  const cached = prefetchCache?.get(id)
  if (cached) {
    prefetchCache?.delete(id)
    logPlayback('prefetch-hit', { id, urls: cached })
    return { urls: cached, firstUrlLevel: 'prefetch', isTrial: false }
  }

  // 1. 检查 SQLite / IndexedDB 持久缓存
  try {
    const persisted = await dbCache.urlGet(id)
    if (persisted && Array.isArray(persisted) && persisted.length > 0) {
      logPlayback('url-cache-hit', { id })
      // 后台刷新，不阻塞播放
      refreshSongUrlsBg(id, preferredLevel)
      return { urls: persisted as string[], firstUrlLevel: 'cache', isTrial: false }
    }
  } catch { /* swallow */ }

  const fallbackUrl = FALLBACK_URL_TEMPLATE(id)
  const candidates: UrlCandidate[] = []
  const trialCandidates: UrlCandidate[] = []
  let firstUrlLevel = ''

  // Phase 1: 快速出声
  const fastTiers = uniqueLevels(['standard', 'higher', preferredLevel])
  for (const level of fastTiers) {
    const result = await fetchSongUrl(id, level, false, PLAYBACK.FAST_TIMEOUT, authOpts, signal)
    if (!result) continue
    if (result.isTrial) {
      addCandidate(trialCandidates, result)
    } else {
      addCandidate(candidates, result)
      firstUrlLevel = level
      break
    }
  }

  // Phase 2: unblock 尝试（仍快速）
  if (candidates.length === 0) {
    for (const level of fastTiers) {
      const result = await fetchSongUrl(id, level, true, PLAYBACK.FAST_TIMEOUT, authOpts, signal)
      if (!result) continue
      if (result.isTrial) {
        addCandidate(trialCandidates, result)
      } else {
        addCandidate(candidates, result)
        firstUrlLevel = level + '+unblock'
        break
      }
    }
  }

  // Phase 3: 官方 match 解灰
  if (candidates.length === 0) {
    const matched = await fetchMatchedSongUrl(id, PLAYBACK.FAST_TIMEOUT, signal)
    if (matched?.url) {
      addCandidate(candidates, matched)
      firstUrlLevel = 'match'
    }
  }

  // Phase 4: 老版 /song/url 兜底
  if (candidates.length === 0) {
    const old = await fetchOldSongUrl(id, PLAYBACK.FAST_TIMEOUT, signal)
    if (old?.url) {
      addCandidate(candidates, old)
      firstUrlLevel = 'old-api'
    }
  }

  // Phase 5: 试听片段
  if (candidates.length === 0 && trialCandidates.length > 0) {
    trialCandidates.forEach(candidate => addCandidate(candidates, { ...candidate, cacheable: false }))
  }

  // Phase 6: 官方 fallback 兜底
  if (candidates.length === 0) {
    addCandidate(candidates, { url: fallbackUrl, source: 'template-fallback', cacheable: false })
  }

  const urls = candidates.map(candidate => candidate.url)

  // 判断是否为试听：所有 URL 都是试听片段或 fallback
  const isTrial = candidates.length > 0 && candidates.every(candidate => candidate.isTrial || candidate.source === 'template-fallback')

  const cacheableUrls = candidates.filter(candidate => candidate.cacheable).map(candidate => candidate.url)
  if (cacheableUrls.length > 0) {
    const ttl = isTrial ? 10 * 60 * 1000 : 60 * 60 * 1000
    dbCache.urlSet(id, cacheableUrls, ttl).catch((err) => swallowError('UrlResolver.cacheUrlSet', err))
  }

  return { urls, firstUrlLevel, isTrial }
}
