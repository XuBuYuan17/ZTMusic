import { listeningDB, ListeningCheckpoints } from '../db/listening.ts'
import { dbHistory } from '../db/history.ts'
import { summarizeLocalListening } from './listening-stats.ts'
import { ListeningSession, type ListeningArchive } from './listening-report.ts'
import { ncm } from '../api/client.ts'
import { apiSession } from '../api/session.ts'
import type { CompactTrack } from '../player/queue.ts'
import type { ListeningSignal, PlayerEngineState } from '../types/player.ts'
import type { SongId } from '../types/music.ts'
import { isMobileDevice } from '../utils/responsive.ts'

export const LISTENING_CHANGE = 'listening-report-change'
let initialization: Promise<void> | undefined
let archiveSnapshot: ListeningArchive | undefined
let session: ListeningSession | undefined
let running = false
let awaitingSource = false
let installed = false
let saveError = ''
/** 待打卡的曲目。本地 / WebDAV 曲目没有网易云 id，保持 null 表示不上报 */
let scrobbleTarget: { id: SongId; name: string; artist: string } | null = null
const checkpoints = new ListeningCheckpoints(rows => listeningDB.save(rows))

function notify(): void { window.dispatchEvent(new Event(LISTENING_CHANGE)) }
export function listeningSaveError(): string { return saveError }

/**
 * 听歌打卡：把这次有效播放写进服务端，日推、听歌排行、年度报告都吃这份数据。
 * 失败直接丢弃——一次播放记录不值得为它引入离线队列与重试。
 */
function scrobblePlay(seconds: number, duration: number): void {
  const target = scrobbleTarget
  // 没登录时服务端只会回 401，白白发一轮请求，本地判定挡掉
  if (!target || seconds <= 0 || !apiSession.getCookie()) return
  void ncm.scrobble(target.id, seconds, {
    total: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
    name: target.name || undefined,
    artist: target.artist || undefined,
  }).catch(() => {})
}

export function initializeListening(): Promise<void> {
  if (isMobileDevice()) return Promise.resolve()
  if (!initialization) initialization = (async () => {
    if (!archiveSnapshot) {
      const existing = await listeningDB.read()
      if (existing.archive) return
      const stats = summarizeLocalListening(await dbHistory.list(200, true))
      archiveSnapshot = { startedAt: Date.now(), legacy: { playCount: stats.playCount, totalDuration: stats.totalDuration } }
    }
    await listeningDB.initialize(archiveSnapshot)
  })().catch(error => { initialization = undefined; throw error })
  return initialization
}

export async function flushListening(): Promise<void> {
  if (isMobileDevice() && !session) return
  if (session) checkpoints.put(session.snapshot())
  try {
    await initializeListening()
    await checkpoints.flush()
    saveError = ''
    notify()
  } catch {
    const message = '听歌统计尚未保存，正在保留本次记录并自动重试。请暂时不要关闭应用。'
    if (saveError !== message) { saveError = message; notify() }
  }
}

export function beginListening(track: CompactTrack): void {
  if (session) checkpoints.put(session.snapshot())
  running = false
  awaitingSource = true
  session = undefined
  scrobbleTarget = null
  if (!isMobileDevice()) {
    session = new ListeningSession(crypto.randomUUID(), {
      key: `${track.source || 'online'}:${track.id}`,
      name: track.name || '未知歌曲',
      artists: track.ar.map(artist => artist.name).filter(Boolean),
      cover: /^(https?:|data:image\/)/.test(track.picUrl || track.al.picUrl) ? track.picUrl || track.al.picUrl : '',
    })
    if (!track.source || track.source === 'online') {
      scrobbleTarget = { id: track.id, name: track.name || '', artist: track.ar.map(artist => artist.name).filter(Boolean).join('/') }
    }
    void flushListening()
  }
}

export function observeListening(signal: ListeningSignal, state: PlayerEngineState, track: CompactTrack | null): void {
  if (isMobileDevice()) { running = false; session?.reset(); return }
  if (signal === 'resume' && !session && track) { beginListening(track); awaitingSource = false }
  if (!session) return
  if (signal === 'source') { awaitingSource = false; running = false; session.reset(); return }
  if (awaitingSource) return
  if (signal === 'reset') { running = false; session.reset(); return }
  if (signal === 'resume') { running = true; session.reset() }
  if (running && session.sample(state.currentTime, performance.now(), Date.now(), state.duration)) {
    scrobblePlay(session.playedMs / 1000, state.duration)
  }
  if (signal === 'suspend' || signal === 'end') {
    running = false
    session.reset()
    void flushListening()
    if (signal === 'end') session = undefined
  }
}

export function installListeningRecorder(onError: (message: string) => void): () => void {
  if (isMobileDevice() || installed) return () => {}
  installed = true
  let shownError = ''
  const reportError = () => {
    if (saveError && saveError !== shownError) onError(saveError)
    shownError = saveError
  }
  const flush = () => { void flushListening() }
  const timer = setInterval(flush, 5000)
  window.addEventListener(LISTENING_CHANGE, reportError)
  document.addEventListener('visibilitychange', flush)
  window.addEventListener('pagehide', flush)
  flush()
  return () => {
    flush()
    clearInterval(timer)
    window.removeEventListener(LISTENING_CHANGE, reportError)
    document.removeEventListener('visibilitychange', flush)
    window.removeEventListener('pagehide', flush)
    installed = false
  }
}
