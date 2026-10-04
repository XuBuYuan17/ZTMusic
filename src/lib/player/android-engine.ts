import { invoke, addPluginListener } from '@tauri-apps/api/core'
import type { PlayerEngine, PlayerEngineState, EngineTimeListener, EngineStateListener, EngineErrorListener, ListeningSignal, PlayMode, QualityLevel } from '../types/player.ts'
import type { CompactTrack } from './queue.ts'
import { androidPosition, parseAndroidState, type AndroidPlaybackState } from './android-state.ts'
import { apiSession } from '../api/session.ts'
import { getStorage, setStorage } from '../utils/storage.ts'

export const androidCommand = <T = unknown>(action: string, data: unknown = {}): Promise<T> => invoke<T>('plugin:zt-player|execute', { payload: { action, data } })

export class AndroidEngine implements PlayerEngine {
  readonly native = true
  private snapshot: AndroidPlaybackState = { anchorPosition: 0, anchorTimestamp: Date.now(), playbackSpeed: 1, duration: 0, playing: false, loading: false, ended: false, index: -1, volume: .8, mode: 'list', error: '', tracks: [] }
  private connecting: Promise<void> | undefined
  private listener: { unregister: () => Promise<void> } | undefined
  private destroyed = false
  private pending: Promise<unknown> = Promise.resolve()
  private progressTimer: ReturnType<typeof setInterval> | undefined
  private journalTimer: ReturnType<typeof setInterval> | undefined
  private syncingJournal = false
  private sources = new Map<string, string>()
  private generation = 0
  private handlers: {
    time?: EngineTimeListener; ended?: EngineStateListener; load?: EngineStateListener; ready?: EngineStateListener
    error?: EngineErrorListener; play?: EngineStateListener; pause?: EngineStateListener
    state?: (state: AndroidPlaybackState) => void
  } = {}

  connect(): Promise<void> {
    return this.connecting ??= (async () => {
      this.listener = await addPluginListener<unknown>('zt-player', 'state', value => { if (!this.destroyed) this.accept(value) })
      if (this.destroyed) { await this.listener.unregister(); return }
      const state = await androidCommand('state')
      if (this.destroyed) { await this.listener?.unregister(); return }
      this.accept(state)
      this.progressTimer = setInterval(() => { if (!document.hidden) this.handlers.time?.(this.currentTime) }, 250)
      this.journalTimer = setInterval(() => { if (!document.hidden) void this.syncJournal() }, 10000)
      document.addEventListener('visibilitychange', this.visibility)
      void this.syncJournal()
    })().catch(async error => {
      await this.listener?.unregister().catch(() => {})
      this.listener = undefined
      this.connecting = undefined
      throw error
    })
  }
  private visibility = () => { if (!document.hidden) { void this.command('state'); void this.syncJournal() } }
  private accept(value: unknown): void {
    const previous = this.snapshot
    const state = parseAndroidState(value)
    if (state.revision != null && previous.revision != null && state.revision < previous.revision) return
    this.snapshot = state
    for (const track of state.tracks) if (track.nativeUri) this.sources.set(String(track.id), track.nativeUri)
    this.handlers.state?.(state)
    const engineState = this.getState()
    this.handlers.time?.(this.currentTime)
    if (state.loading && !previous.loading) this.handlers.load?.(engineState)
    if (!state.loading && (previous.loading || state.duration !== previous.duration)) this.handlers.ready?.(engineState)
    if (state.playing !== previous.playing) (state.playing ? this.handlers.play : this.handlers.pause)?.(engineState)
    if (state.ended && !previous.ended) this.handlers.ended?.(engineState)
    if (state.error && state.error !== previous.error) this.reportError(new Error(state.error))
  }
  private reportError(error: unknown): void {
    this.handlers.error?.({ ...this.getState(), event: new Event('error'), code: 4, message: error instanceof Error ? error.message : 'Native playback failed', codecSupport: { mp3: 'native', aac: 'native', mp4: 'native', flac: 'native' } })
  }
  command(action: string, data: unknown = {}): Promise<void> {
    const result = this.pending.then(async () => {
      await this.connect()
      if (this.destroyed) return
      this.accept(await androidCommand(action, data))
    })
    this.pending = result.catch(error => { this.reportError(error) })
    return result
  }
  async setQueue(tracks: readonly CompactTrack[], index: number, play: boolean, options: { mode: PlayMode; quality: QualityLevel; position?: number }): Promise<void> {
    const version = ++this.generation
    const nativeTracks = tracks.map(track => ({ ...track, nativeUri: track.source === 'local' || track.source === 'webdav' ? '' : `ztmusic://song/${track.id}` }))
    for (const track of nativeTracks) {
      if (track.nativeUri) continue
      const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(track.id))))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      track.nativeUri = `ztmusic://local/${key}`
      if (!this.sources.has(String(track.id))) {
        const status = await androidCommand<{ exists: boolean }>('cacheStatus', { key })
        if (!status.exists) {
          const url = track.source === 'webdav'
            ? await (await import('../local-music/webdav.ts')).getWebDavPlayableUrl(track)
            : await (await import('../local-music/storage.ts')).getLocalPlayableUrl(track.localId || track.id)
          const blob = await (await fetch(url)).blob()
          for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
            if (version !== this.generation || this.destroyed) return
            const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer())
            const chunks: string[] = []
            for (let start = 0; start < bytes.length; start += 8192) chunks.push(String.fromCharCode(...bytes.subarray(start, start + 8192)))
            await androidCommand('cacheChunk', { key, offset, bytes: btoa(chunks.join('')), last: offset + bytes.length >= blob.size })
          }
        }
        this.sources.set(String(track.id), track.nativeUri)
      }
    }
    if (version !== this.generation || this.destroyed) return
    await this.command(play ? 'start' : 'queue', { tracks: nativeTracks, index: Math.max(0, index), base: apiSession.getBase(), cookie: apiSession.getCookie(), quality: options.quality, mode: options.mode, position: (options.position ?? 0) * 1000 })
  }
  onNativeState(listener: (state: AndroidPlaybackState) => void): void { this.handlers.state = listener }
  private async syncJournal(): Promise<void> {
    if (this.syncingJournal || this.destroyed) return
    this.syncingJournal = true
    try {
      const { importNativeListening } = await import('../services/listening-recorder.ts')
      let cursor = Number(getStorage('native_listening_cursor', '0')) || 0
      while (!this.destroyed) {
        const result = await androidCommand<{ cursor: number; rows: unknown[] }>('journal', { cursor })
        if (!Number.isFinite(result.cursor) || result.cursor < cursor || !Array.isArray(result.rows)) throw new Error('Invalid native listening journal')
        await importNativeListening(result.rows)
        setStorage('native_listening_cursor', result.cursor)
        if (result.rows.length < 500 || result.cursor === cursor) break
        cursor = result.cursor
      }
    } catch (error) { console.warn('[Media3] listening journal sync failed', error instanceof Error ? error.message : 'unknown') }
    finally { this.syncingJournal = false }
  }
  getState(): PlayerEngineState { return { src: this.src, currentTime: this.currentTime, duration: this.duration, ended: this.snapshot.ended, networkState: this.snapshot.loading ? 2 : 1, readyState: this.snapshot.loading ? 2 : 4, paused: this.paused } }
  get currentTime(): number { return androidPosition(this.snapshot) }
  get duration(): number { return this.snapshot.duration / 1000 }
  get paused(): boolean { return !this.snapshot.playing }
  get src(): string { return this.snapshot.tracks[this.snapshot.index]?.nativeUri || '' }
  get preloadedSrc(): string { return '' }
  load(): void { throw new Error('Native sources must be loaded through the service queue') }
  play(): Promise<void> { return this.command('play') }
  pause(): void { void this.command('pause').catch(() => {}) }
  toggle(): Promise<void> { return this.command(this.paused ? 'play' : 'pause') }
  seek(position: number): void { if (Number.isFinite(position)) void this.command('seek', { position: Math.max(0, position) * 1000 }).catch(() => {}) }
  setVolume(volume: number): void { if (Number.isFinite(volume)) void this.command('volume', { volume }).catch(() => {}) }
  setMode(mode: PlayMode): void { void this.command('mode', { mode }).catch(() => {}) }
  next(): void { void this.command('next').catch(() => {}) }
  previous(): void { void this.command('previous').catch(() => {}) }
  preload(): void {}
  cancelPreload(): void {}
  swapToPreloaded(): boolean { return false }
  onTimeUpdate(listener: EngineTimeListener): void { this.handlers.time = listener }
  onEnded(listener: EngineStateListener): void { this.handlers.ended = listener }
  onLoadStart(listener: EngineStateListener): void { this.handlers.load = listener }
  onCanPlay(listener: EngineStateListener): void { this.handlers.ready = listener }
  onError(listener: EngineErrorListener): void { this.handlers.error = listener }
  onPlay(listener: EngineStateListener): void { this.handlers.play = listener }
  onPause(listener: EngineStateListener): void { this.handlers.pause = listener }
  onListening(_listener: (signal: ListeningSignal, state: PlayerEngineState) => void): void {}
  destroy(): void {
    this.destroyed = true; this.generation++
    clearInterval(this.progressTimer); clearInterval(this.journalTimer)
    document.removeEventListener('visibilitychange', this.visibility)
    void this.listener?.unregister()
    this.handlers = {}
  }
}
