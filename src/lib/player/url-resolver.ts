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
import { dbCache, getUrlCacheContext, getUrlCacheMetadata, type SongUrlCacheEntry } from '../db/cache.ts'
import { QUALITY_ORDER, PLAYBACK, FALLBACK_URL_TEMPLATE } from '../utils/constants.ts'
import { swallowError } from '../utils/logging.ts'
import { resolveWithSourcePlugins } from './source-plugins.ts'
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
  loudnessAttenuationDb?: number
  isTrial?: boolean
  source: string
  level?: string
  cacheable: boolean
}

function addCandidate(candidates: UrlCandidate[], candidate: UrlCandidate | null | undefined): void {
  if (!candidate?.url || candidates.some(item => item.url === candidate.url)) return
  candidates.push(candidate)
}

function withTimeout<T>(request: (signal: AbortSignal) => Promise<T>, timeout: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  let onAbort: (() => void) | null = null
  const cleanup = () => {
    if (timer !== null) { clearTimeout(timer); timer = null }
    if (onAbort && signal) { signal.removeEventListener('abort', onAbort); onAbort = null }
  }
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('play url timeout')
      controller.abort(error)
      reject(error)
    }, timeout)
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      onAbort = () => {
        controller.abort(signal.reason)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
  return Promise.race([Promise.resolve().then(() => request(controller.signal)), timeoutPromise]).finally(cleanup)
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
    const item = await withTimeout(requestSignal => musicService.getStream(id, { level, unblock, signal: requestSignal }), timeout, signal)
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
      loudnessAttenuationDb: item.loudnessAttenuationDb,
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
    const candidate = await withTimeout(requestSignal => musicService.getMatchedStream(id, requestSignal), timeout, signal)
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
    const candidate = await withTimeout(requestSignal => musicService.getLegacyStream(id, 320000, requestSignal), timeout, signal)
    const url = candidate?.url || ''
    if (!url) return null
    const normalized = normalizePlayUrl(url)
    logPlayback('old-api-fallback', { id, url: normalized })
    return normalized ? { url: normalized, source: 'old-api', cacheable: false } : null
  } catch { /* swallow */ }
  return null
}

export async function invalidatePlayableUrl(id: SongId, url: string): Promise<void> {
  await dbCache.urlRemove(id, normalizePlayUrl(url))
}

// ===== 后台刷新/填充 =====

/** 后台刷新 IndexedDB 中的 URL 缓存（不阻塞播放） */
export async function refreshSongUrlsBg(id: SongId, preferredLevel: string, signal?: AbortSignal, cachedEntry?: SongUrlCacheEntry): Promise<void> {
  const context = await getUrlCacheContext()
  const isActive = () => !signal?.aborted && context.isCurrent()
  if (!isActive()) return
  const existing = cachedEntry ?? await dbCache.urlGetEntry(id, context)
  if (!isActive()) return
  const existingLevel = existing?.candidates[0]?.level || ''
  const targetLevel = isBetterThanLevel(existingLevel, preferredLevel) ? existingLevel : preferredLevel
  const fastTiers = QUALITY_ORDER.slice(Math.max(0, QUALITY_ORDER.indexOf(targetLevel)))
  for (const level of fastTiers) {
    if (!isActive()) return
    const result = await fetchSongUrl(id, level, false, PLAYBACK.FAST_TIMEOUT, {}, signal)
    if (!isActive()) return
    if (result?.url && !result.isTrial && result.cacheable) {
      dbCache.urlSetEntry(id, [result], { context, preserveHigherQuality: true, isActive }).catch((err) => swallowError('UrlResolver.cacheUrlSet', err))
      return
    }
  }
  for (const level of fastTiers) {
    if (!isActive()) return
    const result = await fetchSongUrl(id, level, true, PLAYBACK.FAST_TIMEOUT, {}, signal)
    if (!isActive()) return
    if (result?.url && !result.isTrial && result.cacheable) {
      dbCache.urlSetEntry(id, [result], { context, preserveHigherQuality: true, isActive }).catch((err) => swallowError('UrlResolver.cacheUrlSet', err))
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
  onUrls?: (urls: string[]) => void
  isUrlFailed?: (url: string) => boolean
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
    onUrls,
    isUrlFailed = () => false,
    isStale = () => false,
    authOpts = {},
    signal,
  } = options

  const context = await getUrlCacheContext()
  const urls = currentUrls.filter(url => !isUrlFailed(url))
  const cacheableCandidates: UrlCandidate[] = []
  const allLevels = orderedPlayLevels(preferredLevel)
  let upgraded = false

  // 用于判断请求是否仍有效
  const isActive = () => !signal?.aborted && !isStale() && context.isCurrent()
  const activeUrls = () => urls.filter(url => !isUrlFailed(url))
  const notifyUrls = () => {
    if (!isActive() || !onUrls) return
    const discovered = activeUrls().filter(url => !currentUrls.includes(url))
    if (discovered.length > 0) onUrls(discovered)
  }

  // Step 1: 后台获取偏好音质
  // covered 记录已经拿到过 URL 的实际档位：服务端会把拿不到的档位降级（非 VIP 请求
  // lossless 返回的是 exhigh），后面再问 exhigh 只会得到同一个 URL，白跑一次请求。
  const coveredLevels = new Set<string>()
  for (const level of allLevels) {
    if (!isActive()) return activeUrls()
    if (coveredLevels.has(level)) continue
    const result = await fetchSongUrl(id, level, false, PLAYBACK.FALLBACK_TIMEOUT, authOpts, signal)
    if (!isActive()) return activeUrls()
    if (!result || isUrlFailed(result.url)) continue
    if (result.cacheable && !result.isTrial) addCandidate(cacheableCandidates, result)
    // 服务端可能把档位降级（非 VIP 请求 lossless 拿到的是 exhigh），实际档位才算数
    const actualLevel = result.level || level
    coveredLevels.add(actualLevel)
    if (urls.includes(result.url)) continue

    if (!upgraded && urls.length > 0 && isBetterThanLevel(actualLevel, firstUrlLevel)) {
      // 升级到更优音质：仅当未在播放中才无缝切换，否则仅入队
      urls.unshift(result.url)
      upgraded = true
      logPlayback('quality-upgrade', { level: actualLevel, firstUrlLevel, url: result.url })
      if (isPlaying && isActive() && currentTime > 30) {
        // 播放超过 30s 后不再中途切 URL，避免 pop/静音
        logPlayback('quality-upgrade-deferred', { level: actualLevel, currentTime })
      } else if (isPlaying && isActive()) {
        onQualityUpgrade?.({
          url: result.url,
          currentTime,
          urls: activeUrls(),
          level: actualLevel,
        })
      }
    } else {
      urls.push(result.url)
    }
    notifyUrls()
  }

  // Step 2: unblock 版本（另一条音源，档位覆盖情况要重新算）
  const coveredUnblockLevels = new Set<string>()
  for (const level of allLevels) {
    if (!isActive()) return activeUrls()
    if (coveredUnblockLevels.has(level)) continue
    const result = await fetchSongUrl(id, level, true, PLAYBACK.FALLBACK_TIMEOUT, authOpts, signal)
    if (!isActive()) return activeUrls()
    if (!result || isUrlFailed(result.url)) continue
    if (result.cacheable && !result.isTrial) addCandidate(cacheableCandidates, result)
    coveredUnblockLevels.add(result.level || level)
    if (!urls.includes(result.url)) {
      urls.push(result.url)
      notifyUrls()
    }
  }

  // Step 3: UnblockNeteaseMusic 直接解灰
  if (isActive() && activeUrls().length <= 2) {
    const matched = await fetchMatchedSongUrl(id, PLAYBACK.FALLBACK_TIMEOUT, signal)
    if (!isActive()) return activeUrls()
    if (matched?.cacheable && !isUrlFailed(matched.url)) addCandidate(cacheableCandidates, matched)
    if (matched?.url && !isUrlFailed(matched.url) && !urls.includes(matched.url)) {
      urls.push(matched.url)
      notifyUrls()
    }
  }

  // Step 4: 老版 /song/url 兜底
  if (isActive() && activeUrls().length <= 2) {
    const old = await fetchOldSongUrl(id, PLAYBACK.FALLBACK_TIMEOUT, signal)
    if (!isActive()) return activeUrls()
    if (old?.url && !isUrlFailed(old.url) && !urls.includes(old.url)) {
      urls.push(old.url)
      notifyUrls()
    }
  }

  // Step 5: 用户配置的可拔插音源。仅在官方链路较弱时补充，避免每首歌都请求第三方。
  if (isActive() && activeUrls().length <= 2) {
    const pluginCandidates = await resolveWithSourcePlugins({
      providerId: 'netease',
      sourceId: id,
      quality: preferredLevel,
    }, { signal, isStale, stopAfterFirst: false })
    if (!isActive()) return activeUrls()
    for (const candidate of pluginCandidates) {
      const url = normalizePlayUrl(candidate.url)
      if (url && !isUrlFailed(url) && !urls.includes(url)) {
        urls.push(url)
        notifyUrls()
      }
    }
  }

  // Step 6: 网易官方 fallback
  if (isActive()) {
    const fbUrl = normalizePlayUrl(FALLBACK_URL_TEMPLATE(id))
    if (fbUrl && !isUrlFailed(fbUrl) && !urls.includes(fbUrl)) {
      urls.push(fbUrl)
      notifyUrls()
    }
  }

  if (isActive() && cacheableCandidates.length > 0) {
    const orderedCandidates = activeUrls().flatMap(url => cacheableCandidates.filter(candidate => candidate.url === url))
    dbCache.urlSetEntry(id, orderedCandidates, { context, preserveHigherQuality: true, isUrlFailed, isActive }).catch((err) => swallowError('UrlResolver.cacheUrlSet', err))
  }

  logPlayback('fallback-urls-filled', { totalUrls: urls.length, id, upgraded })
  return activeUrls()
}

export interface PlayableUrlsResult {
  urls: string[]
  firstUrlLevel: string
  isTrial: boolean
  loudnessAttenuationDb?: number
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
  forceRefresh = false,
): Promise<PlayableUrlsResult> {
  if (signal?.aborted) return { urls: [], firstUrlLevel: '', isTrial: false }
  const context = await getUrlCacheContext()
  const isActive = () => !signal?.aborted && context.isCurrent()
  if (!isActive()) return { urls: [], firstUrlLevel: '', isTrial: false }
  // 手动换档跳过旧缓存，重新请求用户指定的档位。
  if (!forceRefresh) {
    // 0. 检查预取缓存
    const cached = prefetchCache?.get(id)
    if (cached) {
      prefetchCache?.delete(id)
      const entry = getUrlCacheMetadata(cached)
      if (context.namespace && entry?.namespace === context.namespace && entry.expiresAt > Date.now()) {
        logPlayback('prefetch-hit', { id, urls: cached })
        return { urls: cached, firstUrlLevel: entry.candidates[0]?.level || entry.candidates[0]?.source || 'prefetch', isTrial: false, loudnessAttenuationDb: entry.candidates[0]?.loudnessAttenuationDb }
      }
    }

    // 1. 检查 SQLite / IndexedDB 持久缓存
    try {
      const persisted = await dbCache.urlGetEntry(id, context)
      if (!isActive()) return { urls: [], firstUrlLevel: '', isTrial: false }
      if (persisted?.urls.length) {
        logPlayback('url-cache-hit', { id })
        return { urls: persisted.urls, firstUrlLevel: persisted.candidates[0]?.level || persisted.candidates[0]?.source || 'cache', isTrial: false, loudnessAttenuationDb: persisted.candidates[0]?.loudnessAttenuationDb }
      }
    } catch { /* swallow */ }
  }

  const fallbackUrl = FALLBACK_URL_TEMPLATE(id)
  const candidates: UrlCandidate[] = []
  const trialCandidates: UrlCandidate[] = []
  let firstUrlLevel = ''

  // 手动换档优先请求目标音质，再向下回退；普通点播保留快速出声策略。
  const fastTiers = forceRefresh
    ? QUALITY_ORDER.slice(Math.max(0, QUALITY_ORDER.indexOf(preferredLevel)))
    : uniqueLevels(['standard', 'higher', preferredLevel])
  for (const level of fastTiers) {
    const result = await fetchSongUrl(id, level, false, PLAYBACK.FAST_TIMEOUT, authOpts, signal)
    if (!isActive()) return { urls: [], firstUrlLevel: '', isTrial: false }
    if (!result) continue
    if (result.isTrial) {
      addCandidate(trialCandidates, result)
    } else {
      addCandidate(candidates, result)
      firstUrlLevel = result.level || level
      break
    }
  }

  // Phase 2: unblock 尝试（仍快速）
  if (candidates.length === 0) {
    for (const level of fastTiers) {
      const result = await fetchSongUrl(id, level, true, PLAYBACK.FAST_TIMEOUT, authOpts, signal)
      if (!isActive()) return { urls: [], firstUrlLevel: '', isTrial: false }
      if (!result) continue
      if (result.isTrial) {
        addCandidate(trialCandidates, result)
      } else {
        addCandidate(candidates, result)
        firstUrlLevel = (result.level || level) + '+unblock'
        break
      }
    }
  }

  // Phase 3: 官方 match 解灰
  if (candidates.length === 0) {
    const matched = await fetchMatchedSongUrl(id, PLAYBACK.FAST_TIMEOUT, signal)
    if (!isActive()) return { urls: [], firstUrlLevel: '', isTrial: false }
    if (matched?.url) {
      addCandidate(candidates, matched)
      firstUrlLevel = 'match'
    }
  }

  // Phase 4: 老版 /song/url 兜底
  if (candidates.length === 0) {
    const old = await fetchOldSongUrl(id, PLAYBACK.FAST_TIMEOUT, signal)
    if (!isActive()) return { urls: [], firstUrlLevel: '', isTrial: false }
    if (old?.url) {
      addCandidate(candidates, old)
      firstUrlLevel = 'old-api'
    }
  }

  // Phase 5: 用户自行配置的外部音源插件。
  // 不内置任何公共解析服务；只有设置里显式添加并启用后才会发起请求。
  if (candidates.length === 0) {
    const pluginCandidates = await resolveWithSourcePlugins({
      providerId: 'netease',
      sourceId: id,
      quality: preferredLevel,
    }, { signal })
    if (!isActive()) return { urls: [], firstUrlLevel: '', isTrial: false }
    for (const plugin of pluginCandidates) {
      addCandidate(candidates, {
        url: normalizePlayUrl(plugin.url),
        source: `plugin:${plugin.pluginId}`,
        level: plugin.level,
        cacheable: false,
      })
    }
    if (candidates.length > 0) firstUrlLevel = pluginCandidates[0]?.level || 'source-plugin'
  }

  // Phase 6: 试听片段
  if (candidates.length === 0 && trialCandidates.length > 0) {
    trialCandidates.forEach(candidate => addCandidate(candidates, { ...candidate, cacheable: false }))
  }

  // Phase 7: 官方 fallback 兜底
  if (candidates.length === 0) {
    addCandidate(candidates, { url: fallbackUrl, source: 'template-fallback', cacheable: false })
  }

  const urls = candidates.map(candidate => candidate.url)

  // 判断是否为试听：所有 URL 都是试听片段。
  // template-fallback 是「一个真 URL 都没拿到」的兜底，不算试听——把它算进来会让每次解析失败
  // 都报 VIP 文案，而模板 URL 不需要 cookie 就能放，歌其实在正常播
  const isTrial = candidates.length > 0 && candidates.every(candidate => candidate.isTrial)

  const cacheableCandidates = candidates.filter(candidate => candidate.cacheable && !candidate.isTrial)
  if (isActive() && cacheableCandidates.length > 0) {
    dbCache.urlSetEntry(id, cacheableCandidates, { context, preserveHigherQuality: !forceRefresh, isActive }).catch((err) => swallowError('UrlResolver.cacheUrlSet', err))
  }

  return { urls, firstUrlLevel, isTrial, loudnessAttenuationDb: candidates[0]?.loudnessAttenuationDb }
}
