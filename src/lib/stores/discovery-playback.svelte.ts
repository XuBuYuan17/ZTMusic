import { auth } from './auth.svelte.ts'
import { toast } from './toast.svelte.js'
import { player } from './player.svelte.ts'
import { createRecommendationQueue } from '../player/recommendation-queue.ts'
import type { CompactTrack, CompactTrackInput } from '../player/queue.ts'
import type { SongId } from '../types/music.ts'

export type DiscoveryMode = 'heart' | 'roaming'
let kind = $state<DiscoveryMode | null>(null)
let busy = $state(false)
let error = $state('')
const account = () => auth.isLoggedIn && auth.cookieOk ? auth.user : null
const continuation = createRecommendationQueue({
  snapshot: () => ({ account: account(), revision: player.queueRevision, queue: player.queue, index: player.queueIndex, id: player.id, mode: player.mode }),
  replace: (queue, index) => player.replaceQueue(queue, index),
  state(active, loading, message) { if (!active) kind = null; busy = loading; error = message; if (message) toast.error(message) },
})
export const discoveryPlayback = {
  get kind() { return kind },
  get busy() { return busy },
  get error() { return error },
  play(mode: DiscoveryMode, tracks: CompactTrackInput[], index: number, next: (id: SongId) => Promise<CompactTrack[]>): void {
    if (!account() || !tracks.length) return
    continuation.stop()
    player.setMode('list')
    player.playQueue(tracks, index)
    continuation.start(next)
    kind = mode
  },
  update(): void { void continuation.update() },
}
