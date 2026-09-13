import type { SongId } from '../types/music.ts'
import { musicService } from '../music/service.ts'
import { parseLyricResponse } from '../utils/lyrics.ts'

const DEFAULT_CACHE_SIZE = 32

export interface DisplayLyricLine {
  time: unknown
  text: string
  translation: string
}

type Loose = Record<string, unknown>

function asRecord(value: unknown): Loose | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : null
}

function trimField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLyricLine(line: unknown): DisplayLyricLine {
  const l = asRecord(line)
  const text = trimField(l?.content) || trimField(l?.translation) || trimField(l?.roman)
  return {
    time: l?.time,
    text,
    translation: trimField(l?.translation),
  }
}

type FetchLyrics = (id: SongId) => Promise<unknown> | unknown

export interface LyricsLoader {
  load(id: SongId, options?: { force?: boolean }): Promise<DisplayLyricLine[]>
  get(id: SongId): DisplayLyricLine[] | null
  clear(id?: SongId): void
}

export function createLyricsLoader(fetchLyrics: FetchLyrics, maxEntries = DEFAULT_CACHE_SIZE): LyricsLoader {
  const cache = new Map<SongId, DisplayLyricLine[]>()
  const pending = new Map<SongId, Promise<DisplayLyricLine[]>>()

  function get(id: SongId): DisplayLyricLine[] | null {
    const lines = cache.get(id)
    if (!lines) return null
    cache.delete(id)
    cache.set(id, lines)
    return lines
  }

  function set(id: SongId, lines: DisplayLyricLine[]): DisplayLyricLine[] {
    cache.delete(id)
    cache.set(id, lines)
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value as SongId)
    return lines
  }

  function load(id: SongId, { force = false }: { force?: boolean } = {}): Promise<DisplayLyricLine[]> {
    if (!id) return Promise.resolve([])
    if (!force) {
      const cached = get(id)
      if (cached) return Promise.resolve(cached)
      const active = pending.get(id)
      if (active) return active
    }

    const request = Promise.resolve(fetchLyrics(id))
      .then((response): DisplayLyricLine[] => Array.isArray(response)
        ? response.filter((line) => asRecord(line)?.text) as unknown as DisplayLyricLine[]
        : parseLyricResponse(response || {}).lines.map(normalizeLyricLine).filter((line) => line.text))
      .then((lines) => set(id, lines))
      .finally(() => {
        if (pending.get(id) === request) pending.delete(id)
      })

    pending.set(id, request)
    return request
  }

  function clear(id?: SongId): void {
    if (id) cache.delete(id)
    else cache.clear()
  }

  return { load, get, clear }
}

const sharedLyricsLoader = createLyricsLoader((id) => musicService.getLyrics(id))

export const loadLyrics = (id: SongId, options?: { force?: boolean }): Promise<DisplayLyricLine[]> => sharedLyricsLoader.load(id, options)
export const getCachedLyrics = (id: SongId): DisplayLyricLine[] | null => sharedLyricsLoader.get(id)
