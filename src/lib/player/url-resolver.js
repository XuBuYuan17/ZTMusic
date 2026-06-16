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

import { ncm } from '../api/client.js'
import { auth } from '../stores/auth.svelte.js'
import { dbCache } from '../db/cache.js'
import { dbUrlGet, dbUrlSet } from '../utils/dbcache.js'
import { QUALITY_ORDER, PLAYBACK, FALLBACK_URL_TEMPLATE } from '../utils/constants.js'
import { swallowError } from '../utils/error.js'

// ===== 日志工具 =====

const SHOULD_LOG_PLAY_URLS = typeof import.meta !== 'undefined' && import.meta.env?.DEV

function shouldDebugPlayback() {
  return SHOULD_LOG_PLAY_URLS || (typeof localStorage !== 'undefined' && localStorage.getItem('debug_playback') === 'true')
}

function logPlayUrlAttempt(type, payload) {
  if (!shouldDebugPlayback() || typeof console === 'undefined') return
  console.debug(`[play-url:${type}]`, payload)
}

function logPlayback(type, payload = {}) {
  if (!shouldDebugPlayback() || typeof console === 'undefined') return
  console.debug(`[playback:${type}]`, payload)
}

// ===== 工具函数 =====

function normalizePlayUrl(url) {
  if (!url || typeof url !== 'string') return ''
  return url.trim().replace(/^http:\/\/([^/?#]+\.music\.126\.net)([/?#]|$)/i, 'https://$1$2')
}

function addUrl(urls, urlOrObj) {
  if (!urlOrObj) return
  const playableUrl = typeof urlOrObj === 'string' ? urlOrObj : urlOrObj.url
  if (playableUrl && !urls.includes(playableUrl)) urls.push(playableUrl)
}

function withTimeout(promise, timeout) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('play url timeout')), timeout)),
  ])
}

function uniqueLevels(levels) {
  return [...new Set(levels.filter(Boolean))]
}

// ===== 音质排序 =====

/**
 * 根据用户偏好排序音质优先级
 * @param {string} preferredLevel
 * @returns {string[]}
 */
function orderedPlayLevels(preferredLevel) {
  const levels = [...QUALITY_ORDER]
  const prefIdx = levels.indexOf(preferredLevel)
  if (prefIdx > 0) {
    levels.splice(prefIdx, 1)
    levels.unshift(preferredLevel)
  }
  return levels
}

/**
 * 检查 level 是否比 baseLevel 音质更好
 * @param {string} level
 * @param {string} baseLevel
 * @returns {boolean}
 */
function isBetterThanLevel(level, baseLevel) {
  if (!baseLevel) return true
  const cleanBase = baseLevel.replace('+unblock', '')
  const idx1 = QUALITY_ORDER.indexOf(level)
  const idx2 = QUALITY_ORDER.indexOf(cleanBase)
  if (idx1 === -1 || idx2 === -1) return false
  return idx1 < idx2 // 索引越小音质越好
}

// ===== 核心 API =====

async function fetchSongUrl(id, level, unblock, timeout) {
  try {
    const res = await withTimeout(ncm.songUrl(id, level, unblock), timeout)
    const item = res?.data?.[0]
    logPlayUrlAttempt('result', {
      id,
      level,
      unblock,
      code: item?.code ?? res?.code,
      hasUrl: Boolean(item?.url),
      freeTrial: Boolean(item?.freeTrialInfo),
      message: item?.message || res?.message || res?.msg || '',
    })
    if (!item?.url) {
      // 已登录但无音源 → cookie 可能已过期，等待检查结果
      if (auth.isLoggedIn) {
        const stillValid = await auth.checkLoginStatus()
        if (!stillValid) {
          // cookie 已过期并被清除，返回 null 让调用方走 fallback
          logPlayback('auth-cleared-on-no-url', { id, level })
        }
      }
      return null
    }
    if (item.freeTrialInfo && auth.isLoggedIn) {
      // 已登录却返回试听片段 → 等待检查 cookie 是否过期
      const stillValid = await auth.checkLoginStatus()
      if (!stillValid) {
        // cookie 已失效并清除，重试可能会拿到完整 URL（以游客身份）
        logPlayback('auth-cleared-retry', { id, level, unblock })
        // 返回 null 让调用方尝试其他音质或 unblock 路径
        return null
      }
      // VIP 歌曲：登录有效但仍然是试听（该歌曲的确需要 VIP）
      logPlayback('vip-trial', { id, level, url: item.url?.slice(0, 50) })
    }
    return {
      url: normalizePlayUrl(item.url),
      isTrial: Boolean(item?.freeTrialInfo),
    }
  } catch (error) {
    logPlayUrlAttempt('error', {
      id,
      level,
      unblock,
      message: error?.message || 'play url request failed',
    })
    return null
  }
}

// ===== 后台刷新/填充 =====

/**
 * 后台刷新 IndexedDB 中的 URL 缓存（不阻塞播放）
 * @param {number} id
 * @param {string} preferredLevel
 */
export async function refreshSongUrlsBg(id, preferredLevel) {
  const fastTiers = uniqueLevels(['standard', 'higher', preferredLevel])
  for (const level of fastTiers) {
    const result = await fetchSongUrl(id, level, false, PLAYBACK.FAST_TIMEOUT)
    if (result?.url && !result.isTrial) {
      dbCache.urlSet(id, [result.url]).catch(swallowError)
      dbUrlSet(id, [result.url]).catch(swallowError)
      return
    }
  }
  for (const level of fastTiers) {
    const result = await fetchSongUrl(id, level, true, PLAYBACK.FAST_TIMEOUT)
    if (result?.url) {
      dbCache.urlSet(id, [result.url]).catch(swallowError)
      dbUrlSet(id, [result.url]).catch(swallowError)
      return
    }
  }
}

/**
 * 后台填充更多 fallback URL
 * @param {number} id
 * @param {number} reqId - 请求 ID，用于判断是否过期
 * @param {object} options
 * @param {string[]} options.currentUrls - 已有 URL 列表
 * @param {string} options.firstUrlLevel - 首条 URL 的音质等级
 * @param {string} options.preferredLevel - 用户偏好音质
 * @param {boolean} options.isPlaying - 当前是否正在播放
 * @param {number} options.currentTime - 当前播放位置
 * @param {Function} options.onQualityUpgrade - 音质升级回调
 * @param {Function} options.isStale - () => boolean 判断请求是否过期
 */
export async function fillFallbackUrls(id, reqId, options = {}) {
  const {
    currentUrls = [],
    firstUrlLevel = '',
    preferredLevel = 'standard',
    isPlaying = false,
    currentTime = 0,
    onQualityUpgrade,
    isStale = () => false,
  } = options

  const urls = [...currentUrls]
  const allLevels = orderedPlayLevels(preferredLevel)
  let upgraded = false

  // 用于判断请求是否仍有效
  const isActive = () => !isStale()

  // Step 1: 后台获取偏好音质
  for (const level of allLevels) {
    if (!isActive()) return urls
    const result = await fetchSongUrl(id, level, false, PLAYBACK.FALLBACK_TIMEOUT)
    if (!result || urls.includes(result.url)) continue

    if (!upgraded && urls.length > 0 && isBetterThanLevel(level, firstUrlLevel)) {
      // 升级到更优音质
      urls.unshift(result.url)
      upgraded = true
      logPlayback('quality-upgrade', { level, firstUrlLevel, url: result.url })
      if (isPlaying && isActive()) {
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
    const result = await fetchSongUrl(id, level, true, PLAYBACK.FALLBACK_TIMEOUT)
    if (result && !urls.includes(result.url)) urls.push(result.url)
  }

  // Step 3: 网易官方 fallback
  if (isActive()) {
    const fbUrl = normalizePlayUrl(FALLBACK_URL_TEMPLATE(id))
    if (fbUrl && !urls.includes(fbUrl)) {
      urls.push(fbUrl)
    }
  }

  // Step 4: 老版 /song/url 兜底
  if (isActive() && urls.length <= 2) {
    try {
      const oldRes = await withTimeout(ncm.songUrlOld(id, 320000), PLAYBACK.FALLBACK_TIMEOUT)
      const oldItem = oldRes?.data?.[0]
      if (oldItem?.url) {
        const url = normalizePlayUrl(oldItem.url)
        if (url && !urls.includes(url)) {
          urls.push(url)
          logPlayback('old-api-fallback', { url })
        }
      }
    } catch { /* swallow */ }
  }

  // Step 5: UnblockNeteaseMusic 直接解灰
  if (isActive() && urls.length <= 2) {
    try {
      const matchRes = await ncm.songUrlMatch(id)
      const matchUrl = matchRes?.data?.[0]?.url || matchRes?.data?.url || matchRes?.url || ''
      if (matchUrl) {
        const normalized = normalizePlayUrl(matchUrl)
        if (normalized && !urls.includes(normalized)) {
          urls.push(normalized)
          logPlayback('unblock-fallback', { url: normalized })
        }
      }
    } catch { /* swallow */ }
  }

  logPlayback('fallback-urls-filled', { totalUrls: urls.length, id, upgraded })
  return urls
}

/**
 * 获取歌曲的可播放 URL 列表（核心入口）
 *
 * @param {number} id - 歌曲 ID
 * @param {string} preferredLevel - 用户偏好音质
 * @param {Map} prefetchCache - 预取缓存 Map
 * @param {number} reqId - 当前请求 ID（用于竞态控制）
 * @returns {Promise<{urls: string[], firstUrlLevel: string, isTrial: boolean}>}
 */
export async function getPlayableUrls(id, preferredLevel, prefetchCache, reqId) {
  // 0. 检查预取缓存
  const cached = prefetchCache?.get(id)
  if (cached) {
    prefetchCache?.delete(id)
    logPlayback('prefetch-hit', { id, urls: cached })
    return { urls: cached, firstUrlLevel: 'prefetch', isTrial: false }
  }

  // 1. 检查 SQLite / IndexedDB 持久缓存
  try {
    let persisted = await dbCache.urlGet(id)
    if (!persisted || !Array.isArray(persisted) || persisted.length === 0) {
      persisted = await dbUrlGet(id).catch(() => null)
    }
    if (persisted && Array.isArray(persisted) && persisted.length > 0) {
      logPlayback('url-cache-hit', { id })
      // 后台刷新，不阻塞播放
      refreshSongUrlsBg(id, preferredLevel)
      return { urls: persisted, firstUrlLevel: 'cache', isTrial: false }
    }
  } catch { /* swallow */ }

  const fallbackUrl = FALLBACK_URL_TEMPLATE(id)
  const urls = []
  const trialUrls = []
  let firstUrlLevel = ''

  // Phase 1: 快速出声
  const fastTiers = uniqueLevels(['standard', 'higher', preferredLevel])
  for (const level of fastTiers) {
    const result = await fetchSongUrl(id, level, false, PLAYBACK.FAST_TIMEOUT)
    if (!result) continue
    if (result.isTrial) {
      addUrl(trialUrls, result.url)
    } else {
      addUrl(urls, result.url)
      firstUrlLevel = level
      break
    }
  }

  // Phase 2: unblock 尝试（仍快速）
  if (urls.length === 0) {
    for (const level of fastTiers) {
      const result = await fetchSongUrl(id, level, true, PLAYBACK.FAST_TIMEOUT)
      if (!result) continue
      if (result.isTrial) {
        addUrl(trialUrls, result.url)
      } else {
        addUrl(urls, result.url)
        firstUrlLevel = level + '+unblock'
        break
      }
    }
  }

  // Phase 3: 试听片段
  if (urls.length === 0 && trialUrls.length > 0) {
    urls.push(...trialUrls)
  }

  // Phase 4: 官方 fallback 兜底
  if (urls.length === 0) {
    addUrl(urls, fallbackUrl)
  }

  // 持久化到 SQLite / IndexedDB（非 fallback 兜底时）
  if (urls.length > 0 && urls[0] !== fallbackUrl) {
    dbCache.urlSet(id, urls).catch(swallowError)
    dbUrlSet(id, urls).catch(swallowError)
  }

  // 判断是否为试听：所有 URL 都是试听片段或 fallback
  const isTrial = trialUrls.length > 0 && urls.length > 0 && (urls[0] === fallbackUrl || trialUrls.includes(urls[0]))

  return { urls, firstUrlLevel, isTrial }
}
