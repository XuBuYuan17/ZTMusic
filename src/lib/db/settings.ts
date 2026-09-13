/**
 * 设置键值存储（SQLite）
 * 替代 localStorage 的 getStorage / setStorage
 *
 * 用法：
 *   import { dbSettings } from '../db/settings.ts'
 *   await dbSettings.set('volume', '0.8')
 *   const vol = await dbSettings.get('volume', '0.5')
 */

import { ensureDB, getDB, isReady } from './init.ts'
import { getStorage, setStorage, removeStorage } from '../utils/storage.ts'
import { debugLog, describeError } from '../utils/logging.ts'

function isAvailable(): boolean {
  return isReady() && getDB() !== null
}

export const dbSettings = {
  /** 获取设置值 */
  async get(key: string, fallbackVal: string = ''): Promise<string> {
    await ensureDB()
    if (!isAvailable()) return getStorage(key, fallbackVal)
    try {
      const db = getDB()
      if (!db) return fallbackVal
      const result = await db.sql(`SELECT value FROM settings WHERE key = ?`, [key])
      const value = result[0]?.value
      if (value != null) return value as string
      return fallbackVal
    } catch (error) {
      debugLog('db', 'settings get failed', { key, message: describeError(error) })
      return fallbackVal
    }
  },

  /** 设置值 */
  async set(key: string, value: unknown): Promise<void> {
    await ensureDB()
    if (!isAvailable()) {
      setStorage(key, value)
      return
    }
    try {
      const db = getDB()
      if (!db) return
      await db.sql(
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, String(value)]
      )
    } catch (error) {
      debugLog('db', 'settings set failed', { key, message: describeError(error) })
    }
  },

  /** 获取 JSON 值 */
  async getJson<T>(key: string, fallbackVal: T | null = null): Promise<T | null> {
    const val = await this.get(key, '')
    if (val === '') return fallbackVal
    try { return JSON.parse(val) as T }
    catch { return fallbackVal }
  },

  /** 设置 JSON 值 */
  async setJson(key: string, value: unknown): Promise<void> {
    // undefined 无法被 JSON.stringify 序列化（返回 undefined），走 remove 语义避免落库 "undefined" 字面量
    if (value === undefined) {
      await this.remove(key)
      return
    }
    await this.set(key, JSON.stringify(value))
  },

  /** 删除设置 */
  async remove(key: string): Promise<void> {
    await ensureDB()
    if (!isAvailable()) {
      // 保持与 get/set 一致：SQLite 不可用时清理 localStorage fallback，避免遗留脏值
      removeStorage(key)
      return
    }
    try {
      const db = getDB()
      if (!db) return
      await db.sql(`DELETE FROM settings WHERE key = ?`, [key])
    } catch (error) {
      debugLog('db', 'settings remove failed', { key, message: describeError(error) })
    }
  },
}
