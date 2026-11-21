import { dbHistory, type HistoryEntry } from '../db/history.ts'
import { listeningDB } from '../db/listening.ts'
import { auth } from '../stores/auth.svelte.ts'
import { apiSession } from '../api/session.ts'
import { flushListening, LISTENING_CHANGE } from './listening-recorder.ts'
import type { ListeningRecord } from './listening-report.ts'
import { mergeImportedPlaylistGroups, readPlaylistGroups, type PlaylistGroup } from './playlist-groups.ts'
import { getSetting, setSetting } from '../utils/settings.ts'
import { normalizeMobileDock } from '../settings/mobile-dock.ts'

const preferences = ['locale', 'accent_theme', 'preferred_quality', 'restore_session', 'lyrics_blur_effect', 'lyrics_text_blur_effect'] as const
const maximumHistory = 200
const maximumListening = 500

export interface DeviceDataSelection {
  history: boolean
  listening: boolean
  groups: boolean
  settings: boolean
}

interface DeviceSettings {
  theme: 'light' | 'dark'
  values: Partial<Record<(typeof preferences)[number], string>>
  dock: ReturnType<typeof normalizeMobileDock>
}

export interface DeviceMigration {
  version: 1
  userId: string
  nickname: string
  cookie: string
  history?: HistoryEntry[]
  listening?: ListeningRecord[]
  groups?: PlaylistGroup[]
  settings?: DeviceSettings
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const text = (value: unknown, limit = 240): string => typeof value === 'string' ? value.slice(0, limit) : ''
const positiveId = (value: unknown): string => /^[1-9]\d{0,19}$/.test(String(value ?? '')) ? String(value) : ''
const count = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(Math.max(0, Math.min(maximum, value))) : 0
const bounded = (value: unknown, maximum: number): unknown[] => Array.isArray(value) ? value.slice(0, maximum) : []

function cover(value: unknown): string {
  try {
    const url = new URL(text(value, 480))
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    url.search = ''
    url.hash = ''
    return url.href
  } catch { return '' }
}

function historyRows(value: unknown): HistoryEntry[] {
  return bounded(value, maximumHistory).flatMap(raw => {
    const row = record(raw)
    const id = positiveId(row.id)
    const playedAt = count(row.playedAt)
    if (!id || !playedAt || (row.source && row.source !== 'online')) return []
    const artists = bounded(row.artists, 12).map(item => {
      const artist = record(item)
      return { id: positiveId(artist.id) || undefined, name: text(artist.name, 120) }
    }).filter(artist => artist.name)
    const album = record(row.album)
    const duration = count(row.dt ?? row.duration, 24 * 60 * 60_000)
    const image = cover(row.picUrl ?? row.pic_url)
    return [{
      id, name: text(row.name) || '未知歌曲', artists,
      album: { id: positiveId(album.id) || undefined, name: text(album.name), picUrl: cover(album.picUrl) },
      picUrl: image || null, pic_url: image || null, duration, dt: duration,
      playedAt, playCount: count(row.playCount, 100_000) || 1, source: 'online', fileSize: 0,
    }]
  })
}

function listeningRows(value: unknown): ListeningRecord[] {
  return bounded(value, maximumListening).flatMap(raw => {
    const row = record(raw)
    const track = record(row.track)
    const key = text(row.key, 150)
    const day = text(row.day, 10)
    const session = text(row.session, 100)
    const lastAt = count(row.lastAt)
    const trackKey = text(track.key, 32)
    if (!/^online:[1-9]\d{0,19}$/.test(trackKey) || !/^[A-Za-z0-9_:/-]+$/.test(key)
      || !/^\d{4}-\d\d-\d\d$/.test(day) || !session || !lastAt) return []
    return [{
      key, day, session, lastAt,
      milliseconds: count(row.milliseconds, 86_400_000), plays: count(row.plays, 100_000),
      track: { key: trackKey, name: text(track.name), artists: bounded(track.artists, 12).map(name => text(name, 120)), cover: cover(track.cover) },
      hours: Object.fromEntries(Object.entries(record(row.hours)).filter(([hour]) => /^(?:[0-9]|1[0-9]|2[0-3])$/.test(hour))
        .map(([hour, ms]) => [hour, count(ms, 3_600_000)])),
    }]
  })
}

function groupRows(value: unknown): PlaylistGroup[] {
  return bounded(value, 100).flatMap(raw => {
    const row = record(raw)
    const id = text(row.id, 100)
    const name = text(row.name, 30).trim()
    if (!id || !name) return []
    return [{ id, name, playlistIds: [...new Set(bounded(row.playlistIds, 250).map(positiveId).filter(Boolean))] }]
  })
}

function readSettings(value: unknown): DeviceSettings {
  const raw = record(value)
  const values = record(raw.values)
  return {
    theme: raw.theme === 'light' ? 'light' : 'dark',
    values: Object.fromEntries(preferences.flatMap(key => typeof values[key] === 'string' && values[key].length <= 80 ? [[key, values[key]]] : [])),
    dock: normalizeMobileDock(raw.dock),
  }
}

export function validateDeviceMigration(value: unknown): DeviceMigration {
  const row = record(value)
  const userId = positiveId(row.userId)
  const cookie = text(row.cookie, 8193)
  if (row.version !== 1 || !userId || !cookie || cookie.length > 8192 || /[\u0000-\u001f\u007f]/.test(cookie)) {
    throw new Error('迁移数据无效，未登录新设备')
  }
  return {
    version: 1, userId, cookie, nickname: text(row.nickname, 100) || '网易云账号',
    ...(Array.isArray(row.history) ? { history: historyRows(row.history) } : {}),
    ...(Array.isArray(row.listening) ? { listening: listeningRows(row.listening) } : {}),
    ...(Array.isArray(row.groups) ? { groups: groupRows(row.groups) } : {}),
    ...(row.settings && typeof row.settings === 'object' ? { settings: readSettings(row.settings) } : {}),
  }
}

export async function collectDeviceMigration(selection: DeviceDataSelection): Promise<DeviceMigration> {
  const userId = positiveId(auth.user?.userId)
  const version = apiSession.getVersion()
  if (!auth.isLoggedIn || !auth.cookieOk || !userId || !apiSession.getCookie()) throw new Error('请先在旧设备登录有效账号')
  const nickname = auth.user?.nickname
  const history = selection.history ? historyRows(await dbHistory.list(maximumHistory, true)) : undefined
  let listening: ListeningRecord[] | undefined
  if (selection.listening) {
    await flushListening()
    const report = await listeningDB.read()
    listening = listeningRows(report.records.filter(row => row.track?.key.startsWith('online:')).sort((a, b) => b.lastAt - a.lastAt))
  }
  const groups = selection.groups ? groupRows(readPlaylistGroups(userId)) : undefined
  let settings: DeviceSettings | undefined
  if (selection.settings) {
    let dock: unknown = null
    try { dock = JSON.parse(localStorage.getItem('mobile_dock_config') || 'null') } catch {}
    settings = readSettings({ theme: localStorage.getItem('zheting-theme'), dock, values: Object.fromEntries(preferences.map(key => [key, getSetting(key)])) })
  }
  if (version !== apiSession.getVersion() || userId !== positiveId(auth.user?.userId) || !auth.cookieOk) {
    throw new Error('旧设备账号已变化，请重新配对')
  }
  return validateDeviceMigration({ version: 1, userId, nickname, cookie: apiSession.getCookie(), history, listening, groups, settings })
}

export async function importDeviceMigration(payload: DeviceMigration): Promise<{ imported: string[]; failed: string[] }> {
  const imported: string[] = []
  const failed: string[] = []
  const matchingAccount = () => auth.isLoggedIn && positiveId(auth.user?.userId) === payload.userId
  const importPart = async (title: string, run: () => Promise<string> | string) => {
    try {
      if (!matchingAccount()) throw new Error('账号已变化')
      imported.push(await run())
    } catch { failed.push(title) }
  }

  if (payload.history) await importPart('播放历史', async () => '播放历史新增 ' + await dbHistory.mergeImported(payload.history!) + ' 条')
  if (payload.listening) await importPart('听歌统计', async () => {
    const added = await listeningDB.mergeImported(payload.listening!)
    window.dispatchEvent(new Event(LISTENING_CHANGE))
    return '听歌统计新增 ' + added + ' 条'
  })
  if (payload.groups) await importPart('歌单分组', () => '歌单分组新增 ' + mergeImportedPlaylistGroups(payload.userId, payload.groups!) + ' 个')
  if (payload.settings) await importPart('常用设置', () => {
    const settings = payload.settings!
    localStorage.setItem('zheting-theme', settings.theme)
    localStorage.setItem('mobile_dock_config', JSON.stringify(settings.dock))
    for (const key of preferences) {
      const value = settings.values[key]
      if (value !== undefined) setSetting(key, value)
    }
    return '常用设置已导入，重启后应用'
  })
  return { imported, failed }
}
