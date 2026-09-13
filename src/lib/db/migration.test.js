import assert from 'node:assert/strict'
import { LEGACY_MIGRATION_KEY, LEGACY_MESSAGE_READ_STATE_KEY, migrateLegacyData } from './migration.js'

function fakeDB({ migrated = false, failInsert = false, existingHistory = {}, existingSettings = {} } = {}) {
  const calls = []
  return {
    calls,
    async sql(statement, params = []) {
      calls.push({ statement, params })
      if (statement.startsWith('SELECT value')) {
        if (params[0] === LEGACY_MIGRATION_KEY) return migrated ? [{ value: 'done' }] : []
        return params[0] in existingSettings ? [{ value: existingSettings[params[0]] }] : []
      }
      if (statement.startsWith('SELECT played_at')) return params[0] in existingHistory ? [existingHistory[params[0]]] : []
      if (failInsert && statement.includes('INSERT INTO play_history')) throw new Error('insert failed')
      return []
    },
  }
}

{
  const db = fakeDB({
    existingSettings: { [LEGACY_MESSAGE_READ_STATE_KEY]: '{"42":200,"9":30}' },
  })
  await migrateLegacyData(db, {
    settings: { [LEGACY_MESSAGE_READ_STATE_KEY]: '{"42":123,"7":10}' },
  })
  const settingInsert = db.calls.find(({ statement, params }) => (
    statement.startsWith('INSERT INTO settings') && params[0] === LEGACY_MESSAGE_READ_STATE_KEY
  ))
  assert.deepEqual(JSON.parse(settingInsert.params[1]), { 7: 10, 9: 30, 42: 200 })
}

{
  const db = fakeDB()
  const result = await migrateLegacyData(db, {
    history: [{
      id: 'local:demo', name: '本地歌曲', artists: [{ name: '歌手' }],
      album: { name: '专辑' }, duration: 180_000, playedAt: 123, playCount: 4,
      source: 'local', localId: 'local:demo', fileName: 'demo.flac',
    }],
    settings: { 'zheting-message-read-state': '{"42":123}' },
  })

  assert.equal(result.historyCount, 1)
  assert.equal(result.settingCount, 1)
  assert.ok(db.calls.some(({ statement }) => statement === 'BEGIN'))
  assert.ok(db.calls.some(({ statement }) => statement === 'COMMIT'))
  assert.ok(db.calls.some(({ params }) => params[0] === LEGACY_MIGRATION_KEY))
  const historyInsert = db.calls.find(({ statement }) => statement.includes('INSERT INTO play_history'))
  assert.equal(historyInsert.params[0], 'local:demo')
  assert.equal(historyInsert.params[7], 4)
}

{
  const db = fakeDB({ migrated: true })
  const result = await migrateLegacyData(db)
  assert.equal(result.historyCount, 0)
  assert.equal(db.calls.length, 1)
}

{
  const db = fakeDB({
    migrated: true,
    existingHistory: { 1: { played_at: 100, play_count: 5 } },
  })
  const result = await migrateLegacyData(db, { history: [{ id: 1, playedAt: 200, playCount: 2 }] })
  assert.equal(result.historyCount, 1)
  assert.ok(db.calls.some(({ statement }) => statement === 'COMMIT'))
  const historyInsert = db.calls.find(({ statement }) => statement.includes('INSERT INTO play_history'))
  assert.equal(historyInsert.params[7], 7)
}

{
  const db = fakeDB({
    migrated: true,
    existingHistory: { 1: { played_at: 200, play_count: 5 } },
  })
  const result = await migrateLegacyData(db, { history: [{ id: 1, playedAt: 100, playCount: 2 }] })
  assert.equal(result.historyCount, 0)
  assert.ok(!db.calls.some(({ statement }) => statement.includes('INSERT INTO play_history')))
}

{
  const db = fakeDB({ failInsert: true })
  await assert.rejects(() => migrateLegacyData(db, { history: [{ id: 1 }] }), /insert failed/)
  assert.ok(db.calls.some(({ statement }) => statement === 'ROLLBACK'))
  assert.ok(!db.calls.some(({ statement }) => statement === 'COMMIT'))
}

console.log('db legacy migration: 18 assertions passed')
