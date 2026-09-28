import { listeningDB, ListeningCheckpoints } from '../db/listening.ts'
import { dbHistory } from '../db/history.ts'
import { summarizeLocalListening } from './listening-stats.ts'
import { ListeningSession, type ListeningArchive } from './listening-report.ts'
import type { CompactTrack } from '../player/queue.ts'
import type { ListeningSignal, PlayerEngineState } from '../types/player.ts'
import { isMobileDevice } from '../utils/responsive.ts'

export const LISTENING_CHANGE = 'listening-report-change'
let initialization: Promise<void> | undefined
let archiveSnapshot: ListeningArchive | undefined
let session: ListeningSession | undefined
let running = false
let awaitingSource = false
let installed = false
let saveError = ''
const checkpoints = new ListeningCheckpoints(rows => listeningDB.save(rows))

function notify(): void { window.dispatchEvent(new Event(LISTENING_CHANGE)) }
export function listeningSaveError(): string { return saveError }

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
  if (!isMobileDevice()) {
    session = new ListeningSession(crypto.randomUUID(), {
      key: `${track.source || 'online'}:${track.id}`,
      name: track.name || '未知歌曲',
      artists: track.ar.map(artist => artist.name).filter(Boolean),
      cover: /^(https?:|data:image\/)/.test(track.picUrl || track.al.picUrl) ? track.picUrl || track.al.picUrl : '',
    })
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
  if (running) session.sample(state.currentTime, performance.now(), Date.now(), state.duration)
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
