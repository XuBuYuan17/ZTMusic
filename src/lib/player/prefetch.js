/**
 * 预取管理
 *
 * 职责：后台预取下一首歌的 URL 和音频，实现切歌零等待。
 * 独立于播放状态管理，接收必要的上下文参数。
 */

import { ncm } from '../api/client.js'
import { dbCache } from '../db/cache.js'
import { PLAYBACK, LIMITS } from '../utils/constants.js'
import { swallowError } from '../utils/error.js'

const SHOULD_LOG = typeof import.meta !== 'undefined' && import.meta.env?.DEV

function logPlayback(type, payload = {}) {
  if (!SHOULD_LOG && typeof localStorage !== 'undefined' && !localStorage.getItem('debug_playback')) return
  if (typeof console === 'undefined') return
  console.debug(`[playback:${type}]`, payload)
}

function uniqueLevels(levels) {
  return [...new Set(levels.filter(Boolean))]
}

/**
 * 创建预取缓存管理器
 * @returns {{ cache: Map, prefetchNextTrackUrl: Function }}
 */
export function createPrefetchManager() {
  const prefetchCache = new Map()

  /**
   * 后台预取下一首歌的 URL + 音频
   * @param {object} options
   * @param {Array} options.queue - 当前队列
   * @param {number} options.queueIndex - 当前索引
   * @param {string} options.preferredLevel - 用户偏好音质
   * @param {number} options.reqId - 请求 ID
   * @param {Function} options.isStale - () => boolean
   * @param {Function} options.preload - engine.preload(url)
   */
  async function prefetchNextTrackUrl(options = {}) {
    const {
      queue = [],
      queueIndex = -1,
      preferredLevel = 'standard',
      reqId = 0,
      isStale = () => false,
      preload,
    } = options

    if (queue.length < 2 || queueIndex < 0 || isStale()) return

    const nextIdx = (queueIndex + 1) % queue.length
    if (nextIdx === queueIndex) return
    const nextTrack = queue[nextIdx]
    if (!nextTrack?.id || prefetchCache.has(nextTrack.id)) return

    // 限制预取缓存大小
    if (prefetchCache.size >= LIMITS.MAX_PREFETCH) {
      const firstKey = prefetchCache.keys().next().value
      prefetchCache.delete(firstKey)
    }

    const tiers = uniqueLevels(['standard', 'higher', preferredLevel])
    for (const level of tiers) {
      if (isStale()) return
      try {
        const res = await ncm.songUrl(nextTrack.id, level, false)
        const item = res?.data?.[0]
        if (!item?.url) continue
        const urlStr = item.url.trim()
        prefetchCache.set(nextTrack.id, [urlStr])
        logPlayback('prefetch-cached', { id: nextTrack.id, level, url: urlStr })
        // 持久化到 IndexedDB
        dbCache.urlSet(nextTrack.id, [urlStr]).catch(swallowError)
        // 预加载音频
        preload?.(urlStr)
        return
      } catch {
        // 当前 level 失败，尝试下一个
      }
    }
  }

  return {
    cache: prefetchCache,
    prefetchNextTrackUrl,
  }
}
