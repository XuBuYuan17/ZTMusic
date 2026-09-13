import { LIMITS } from '../utils/constants.js'

export const LEGACY_MIGRATION_KEY = 'legacy_storage_migrated_v1'
export const LEGACY_MESSAGE_READ_STATE_KEY = 'zheting-message-read-state'

function mergeMessageReadState(currentValue, legacyValue) {
  try {
    const current = JSON.parse(currentValue || '{}')
    const legacy = JSON.parse(legacyValue || '{}')
    const merged = { ...current }
    for (const [id, time] of Object.entries(legacy)) {
      merged[id] = Math.max(Number(merged[id]) || 0, Number(time) || 0)
    }
    return JSON.stringify(merged)
  } catch {
    return currentValue || legacyValue
  }
}

export async function migrateLegacyData(db, { history = [], settings = {} } = {}) {
  const legacyHistory = (Array.isArray(history) ? history : []).slice(0, LIMITS.MAX_HISTORY)
  const legacySettings = Object.entries(settings).filter(([, value]) => value != null)
  const migrated = await db.sql(`SELECT value FROM settings WHERE key = ?`, [LEGACY_MIGRATION_KEY])
  if (migrated.length > 0 && legacyHistory.length === 0 && legacySettings.length === 0) {
    return { completed: true, historyCount: 0, settingCount: 0 }
  }

  let historyCount = 0
  let settingCount = 0
  await db.sql('BEGIN')
  try {
    for (const track of legacyHistory) {
      if (!track?.id) continue
      const album = track.al || track.album || {}
      const playedAt = track.playedAt || Date.now()
      let playCount = Number(track.playCount) || 1
      if (migrated.length > 0) {
        const existing = await db.sql(
          `SELECT played_at, play_count FROM play_history WHERE song_id = ? LIMIT 1`,
          [track.id],
        )
        if (existing[0] && Number(existing[0].played_at) >= playedAt) continue
        playCount += Number(existing[0]?.play_count) || 0
      }
      await db.sql(`DELETE FROM play_history WHERE song_id = ?`, [track.id])
      await db.sql(
        `INSERT INTO play_history (
          song_id, name, artists, album, pic_url, duration, played_at, play_count,
          source, local_id, webdav_id, remote_url, webdav_base_url, webdav_username, file_name, relative_path, mime, file_size
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          track.id,
          track.name || '',
          JSON.stringify(track.ar || track.artists || []),
          JSON.stringify(album),
          track.picUrl || album.picUrl || '',
          track.dt || track.duration || 0,
          playedAt,
          playCount,
          track.source || '',
          track.localId || '',
          track.webdavId || '',
          track.remoteUrl || '',
          track.webdavBaseUrl || '',
          track.webdavUsername || '',
          track.fileName || '',
          track.relativePath || '',
          track.mime || '',
          track.fileSize || 0,
        ],
      )
      historyCount++
    }

    for (const [key, value] of legacySettings) {
      let nextValue = String(value)
      if (key === LEGACY_MESSAGE_READ_STATE_KEY) {
        const current = await db.sql(`SELECT value FROM settings WHERE key = ?`, [key])
        nextValue = mergeMessageReadState(current[0]?.value, nextValue)
      }
      await db.sql(
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, nextValue],
      )
      settingCount++
    }

    await db.sql(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [LEGACY_MIGRATION_KEY, String(Date.now())],
    )
    await db.sql('COMMIT')
    return { completed: true, historyCount, settingCount }
  } catch (error) {
    await db.sql('ROLLBACK').catch(() => {})
    throw error
  }
}
