import type { CompactTrack } from './queue.ts'
import type { SongId } from '../types/music.ts'

export interface RecommendationSnapshot {
  account: unknown
  revision: number
  queue: readonly CompactTrack[]
  index: number
  id: SongId
  mode: string
}

interface Driver {
  snapshot(): RecommendationSnapshot
  replace(queue: CompactTrack[], index: number): void
  state(active: boolean, busy: boolean, error: string): void
}

/** 补歌只拥有自己启动的队列；切换账号、普通点播或编辑队列后，迟到响应必须丢弃。 */
export function createRecommendationQueue(driver: Driver) {
  let generation = 0
  let session: { account: unknown; revision: number; next: (id: SongId) => Promise<CompactTrack[]> } | null = null
  let busy = false

  function stop(error = ''): void {
    generation++
    session = null
    busy = false
    driver.state(false, false, error)
  }

  function valid(snapshot: RecommendationSnapshot): boolean {
    return !!session && !!snapshot.account && snapshot.account === session.account
      && snapshot.revision === session.revision && snapshot.mode === 'list'
      && snapshot.index >= 0 && String(snapshot.queue[snapshot.index]?.id) === String(snapshot.id)
  }

  async function update(): Promise<void> {
    const snapshot = driver.snapshot()
    if (!session) return
    if (!valid(snapshot)) { stop(); return }
    if (busy || snapshot.queue.length - snapshot.index - 1 > 2) return
    busy = true
    driver.state(true, true, '')
    const token = generation
    try {
      const batch = await session.next(snapshot.id)
      if (token !== generation) return
      const current = driver.snapshot()
      if (!valid(current)) { stop(); return }
      const seen = new Set(current.queue.map(track => String(track.id)))
      const fresh = batch.filter(track => {
        const key = String(track.id)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (!fresh.length) { stop('暂时没有新的推荐，可重新开启模式'); return }
      // 保留当前曲目和最近 20 首历史，限制原生队列 IPC 体积。
      const drop = current.queue.length > 200 ? Math.max(0, current.index - 20) : 0
      driver.replace([...current.queue.slice(drop), ...fresh], current.index - drop)
      session!.revision = driver.snapshot().revision
      busy = false
      driver.state(true, false, '')
    } catch (error) {
      if (token === generation) stop(error instanceof Error ? error.message : '推荐补歌失败，请重新开启模式')
    }
  }

  return {
    stop,
    start(next: (id: SongId) => Promise<CompactTrack[]>): void {
      stop()
      const snapshot = driver.snapshot()
      session = { account: snapshot.account, revision: snapshot.revision, next }
      driver.state(true, false, '')
      void update()
    },
    update,
  }
}
