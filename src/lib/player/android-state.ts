import type { CompactTrack } from './queue.ts'
import type { PlayMode } from '../types/player.ts'

export interface AndroidPlaybackState {
  anchorPosition: number; anchorTimestamp: number; playbackSpeed: number; duration: number
  playing: boolean; loading: boolean; ended: boolean; index: number; volume: number; mode: PlayMode; error: string
  tracks: Array<CompactTrack & { nativeUri?: string }>
  overlayEnabled?: boolean
  revision?: number
}

export function androidPosition(state: AndroidPlaybackState, now = Date.now()): number {
  const elapsed = state.playing ? Math.max(0, now - state.anchorTimestamp) * state.playbackSpeed : 0
  const position = Math.max(0, state.anchorPosition + elapsed)
  return (state.duration > 0 ? Math.min(position, state.duration) : position) / 1000
}

export function parseAndroidState(value: unknown): AndroidPlaybackState {
  if (!value || typeof value !== 'object') throw new Error('Invalid native playback state')
  const state = value as AndroidPlaybackState
  for (const key of ['anchorPosition', 'anchorTimestamp', 'playbackSpeed', 'duration', 'index', 'volume'] as const) {
    if (!Number.isFinite(state[key])) throw new Error(`Invalid native ${key}`)
  }
  if (!Array.isArray(state.tracks) || state.tracks.length > 5000 || !['list', 'shuffle', 'repeat'].includes(state.mode)) throw new Error('Invalid native queue')
  if (!['playing', 'loading', 'ended'].every(key => typeof (value as Record<string, unknown>)[key] === 'boolean') || typeof state.error !== 'string') throw new Error('Invalid native playback flags')
  if (state.anchorPosition < 0 || state.duration < 0 || state.playbackSpeed <= 0 || state.volume < 0 || state.volume > 1 || !Number.isInteger(state.index) || state.index < -1 || state.index >= state.tracks.length) throw new Error('Invalid native playback bounds')
  if (state.revision !== undefined && (!Number.isSafeInteger(state.revision) || state.revision < 0)) throw new Error('Invalid native revision')
  return state
}
