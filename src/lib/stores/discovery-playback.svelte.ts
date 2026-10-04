import { auth } from './auth.svelte.ts'
import { player } from './player.svelte.ts'
import { ncm } from '../api/client.ts'
import { loadHeartMode, loadRoaming } from '../services/discovery-recommendations.ts'
import { createRecommendationQueue } from '../player/recommendation-queue.ts'

export type DiscoveryMode = 'heart' | 'roaming'
let kind = $state<DiscoveryMode | null>(null)
let busy = $state(false)
let error = $state('')
let request = 0
let startingAccount: unknown = null

const account = () => auth.isLoggedIn && auth.cookieOk ? auth.user : null
const snapshot = () => ({
  account: account(), revision: player.queueRevision, queue: player.queue,
  index: player.queueIndex, id: player.id, mode: player.mode,
})
const continuation = createRecommendationQueue({
  snapshot,
  replace: (queue, index) => player.replaceQueue(queue, index),
  state(active, loading, message) {
    if (!active) kind = null
    busy = loading
    error = message
  },
})

export const discoveryPlayback = {
  get kind() { return kind },
  get busy() { return busy },
  get error() { return error },
  async start(mode: DiscoveryMode): Promise<void> {
    if (!account()) { error = '请登录后使用'; return }
    const token = ++request
    continuation.stop()
    busy = true
    error = ''
    const owner = account()!
    const revision = player.queueRevision
    startingAccount = owner
    try {
      const recommendation = mode === 'heart'
        ? await loadHeartMode(ncm, auth.user!.userId, player.id)
        : { tracks: await loadRoaming(ncm), next: () => loadRoaming(ncm) }
      if (token !== request || owner !== account() || revision !== player.queueRevision) return
      player.setMode('list')
      player.playQueue(recommendation.tracks)
      continuation.start(recommendation.next)
      kind = mode
    } catch (cause) {
      if (token === request && owner === account()) error = cause instanceof Error ? cause.message : '推荐加载失败，请重试'
    } finally {
      if (token === request) { startingAccount = null; if (!kind) busy = false }
    }
  },
  update(): void {
    if (startingAccount && startingAccount !== account()) {
      request++
      startingAccount = null
      continuation.stop()
    }
    void continuation.update()
  },
}
