/**
 * useLike — shared "喜欢/收藏" state & API for the current track
 *
 * Centralises like-check + toggle so both mobile (AppleMusicPlayer) and PC
 * (PCPlayer) share one real implementation. Previously PCPlayer only flipped
 * a local boolean (fake like); this wires it to the real NCM like API with
 * login checks and race-safe request IDs.
 *
 * Usage:
 *   const like = useLike(onMessage)  // onMessage(text) optional toast callback
 *   like.liked        // reactive boolean for current player.id
 *   like.busy         // true while a toggle request is in flight
 *   like.toggle()     // async, performs the like/unlike
 */
import type { SongId } from '../types/music.ts'
import { player } from '../stores/player.svelte.ts'
import { auth } from '../stores/auth.svelte.ts'
import { ncm } from '../api/client.ts'
import { parseLikeCheck } from '../utils/like-check.ts'
import { debugLog } from '../utils/error.ts'

export function useLike(onMessage?: (text: string) => void) {
  let liked = $state(false)
  let busy = $state(false)
  let requestId = 0

  function activeUid(): string | number | undefined {
    const rawUid: unknown = auth.user?.userId || auth.user?.id
    return typeof rawUid === 'number' || typeof rawUid === 'string' ? rawUid : undefined
  }

  // Re-check liked status whenever the current track changes.
  $effect(() => {
    const id = player.id
    if (!id) { liked = false; return }
    checkLiked(id)
  })

  async function checkLiked(id: SongId): Promise<void> {
    if (!auth.isLoggedIn || !id) return
    const rid = ++requestId
    try {
      const res = await ncm.songLikeCheck(id)
      if (rid === requestId && player.id === id) liked = parseLikeCheck(res, id)
    } catch (err) {
      const message = (err as { message?: unknown } | null | undefined)?.message
      debugLog('useLike', 'check-error', { id, error: message || String(err) })
      // songLikeCheck 在这台服务端上不稳（SongContextMenu.svelte 早就为此加了同款兜底）。
      // 不兜底的话异常被吞掉、liked 永远停在 false，红心永远是空心
      const uid = activeUid()
      if (!uid) return
      try {
        const list = await ncm.likelist(uid)
        if (rid === requestId && player.id === id) liked = parseLikeCheck(list, id)
      } catch (err2) {
        const message2 = (err2 as { message?: unknown } | null | undefined)?.message
        debugLog('useLike', 'likelist-error', { id, error: message2 || String(err2) })
      }
    }
  }

  async function toggle(): Promise<void> {
    if (!player.id) return
    if (!auth.isLoggedIn) { onMessage?.('请先登录'); return }
    const uid = activeUid()
    if (!uid) { onMessage?.('登录状态异常'); return }
    busy = true
    const nextLiked = !liked
    const trackId = player.id
    try {
      await ncm.like(trackId, nextLiked, uid)
      if (player.id !== trackId) return
      liked = nextLiked
      onMessage?.(nextLiked ? '已收藏' : '已取消收藏')
    } catch {
      onMessage?.('收藏失败')
    } finally {
      // 无论用户是否已切歌，都要释放 busy，避免按钮永久卡在 loading
      busy = false
    }
  }

  return {
    get liked() { return liked },
    get busy() { return busy },
    toggle,
  }
}
