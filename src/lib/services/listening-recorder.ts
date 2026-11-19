import { listeningDB, ListeningCheckpoints } from '../db/listening.ts'
import { dbHistory } from '../db/history.ts'
import { summarizeLocalListening } from './listening-stats.ts'
import { ListeningSession, type ListeningArchive, type ListeningRecord } from './listening-report.ts'
import { ncm } from '../api/client.ts'
import { apiSession } from '../api/session.ts'
import type { CompactTrack } from '../player/queue.ts'
import type { ListeningSignal, PlayerEngineState } from '../types/player.ts'
import type { SongId } from '../types/music.ts'

export const LISTENING_CHANGE = 'listening-report-change'
let initialization: Promise<void> | undefined
let archiveSnapshot: ListeningArchive | undefined
let session: ListeningSession | undefined
let running = false
let awaitingSource = false
let installed = false
let saveError = ''
/** 待打卡的曲目。本地 / WebDAV 曲目没有网易云 id，保持 null 表示不上报 */
let scrobbleTarget: { id: SongId; name: string; artist: string; sessionVersion: number } | null = null
let scrobbleError = ''
let scrobbleRequest = 0
const checkpoints = new ListeningCheckpoints(rows => listeningDB.save(rows))

function notify(): void { window.dispatchEvent(new Event(LISTENING_CHANGE)) }
export function listeningSaveError(): string { return saveError }

export function reportNativeScrobble(failed: boolean): void {
  const error = failed ? '听歌记录已保留在本机，网易云同步未确认' : ''
  if (scrobbleError === error) return
  scrobbleError = error
  notify()
}

export async function importNativeListening(rows: unknown[]): Promise<void> {
  await initializeListening()
  const records = rows as ListeningRecord[]
  if (records.some(row => !row || typeof row.key !== 'string' || !row.session?.startsWith('android:') || !row.track?.key || !Number.isFinite(row.milliseconds) || row.milliseconds < 0 || !Number.isFinite(row.lastAt) || !Number.isFinite(row.plays))) throw new Error('Invalid native listening records')
  try { await listeningDB.save(records); saveError = ''; if (records.length) notify() }
  catch (error) { saveError = error instanceof Error ? error.message : '原生听歌统计同步失败'; notify(); throw error }
}

/**
 * ponytail: 打卡接口没有幂等键，失败时保留本地记录并提示，不自动重发。
 */
function scrobblePlay(seconds: number, duration: number): void {
  const target = scrobbleTarget
  if (!target || seconds <= 0 || target.sessionVersion !== apiSession.getVersion() || !apiSession.getCookie()) return
  const request = ++scrobbleRequest
  function setError(message: string): void {
    if (request !== scrobbleRequest || target?.sessionVersion !== apiSession.getVersion()) return
    scrobbleError = message
    notify()
  }
  void ncm.scrobble(target.id, seconds, {
    total: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
    name: target.name || undefined,
    artist: target.artist || undefined,
  }).then(() => setError(''), () => setError('听歌记录已保留在本机，网易云同步未确认'))
}

export function initializeListening(): Promise<void> {
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
  session = new ListeningSession(crypto.randomUUID(), {
    key: `${track.source || 'online'}:${track.id}`,
    name: track.name || '未知歌曲',
    artists: track.ar.map(artist => artist.name).filter(Boolean),
    cover: /^(https?:|data:image\/)/.test(track.picUrl || track.al.picUrl) ? track.picUrl || track.al.picUrl : '',
  })
  if ((!track.source || track.source === 'online') && /^[1-9]\d*$/.test(String(track.id)) && apiSession.getCookie()) {
    scrobbleTarget = {
      id: track.id,
      name: track.name || '',
      artist: track.ar.map(artist => artist.name).filter(Boolean).join('/'),
      sessionVersion: apiSession.getVersion(),
    }
  }
  void flushListening()
}

export function observeListening(signal: ListeningSignal, state: PlayerEngineState, track: CompactTrack | null): void {
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
  if (installed) return () => {}
  installed = true
  let shownError = ''
  let shownScrobbleError = ''
  const reportError = () => {
    if (saveError && saveError !== shownError) onError(saveError)
    shownError = saveError
    if (scrobbleError && scrobbleError !== shownScrobbleError) onError(scrobbleError)
    shownScrobbleError = scrobbleError
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
