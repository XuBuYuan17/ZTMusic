/**
 * 设置键值存储（SQLite）
 * 替代 localStorage 的 getStorage / setStorage
 *
 * 用法：
 *   import { dbSettings } from '../db/settings.js'
 *   await dbSettings.set('volume', '0.8')
 *   const vol = await dbSettings.get('volume', '0.5')
 */

import { getDB, isReady } from './init.js'
import { getStorage, setStorage } from '../utils/storage.js'

function isAvailable() {
  return isReady() && getDB()
}

export const dbSettings = {
  /**
   * 获取设置值
   * @param {string} key
   * @param {string} [fallbackVal='']
   * @returns {Promise<string>}
   */
  async get(key, fallbackVal = '') {
    if (!isAvailable()) return getStorage(key, fallbackVal)
    try {
      const db = getDB()
      const result = await db.sql(`SELECT value FROM settings WHERE key = ?`, [key])
      if (result.length > 0 && result[0].value != null) {
        return result[0].value
      }
      return fallbackVal
    } catch {
      return getStorage(key, fallbackVal)
    }
  },

  /**
   * 设置值
   * @param {string} key
   * @param {string} value
   */
  async set(key, value) {
    if (!isAvailable()) {
      setStorage(key, value)
      return
    }
    try {
      const db = getDB()
      await db.sql(
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, String(value)]
      )
    } catch {
      setStorage(key, value)
    }
  },

  /**
   * 获取 JSON 值
   * @param {string} key
   * @param {*} [fallbackVal=null]
   * @returns {Promise<*>}
   */
  async getJson(key, fallbackVal = null) {
    const val = await this.get(key, null)
    if (val === null) return fallbackVal
    try { return JSON.parse(val) }
    catch { return fallbackVal }
  },

  /**
   * 设置 JSON 值
   * @param {string} key
   * @param {*} value
   */
  async setJson(key, value) {
    await this.set(key, JSON.stringify(value))
  },

  /**
   * 删除设置
   * @param {string} key
   */
  async remove(key) {
    if (!isAvailable()) return
    try {
      const db = getDB()
      await db.sql(`DELETE FROM settings WHERE key = ?`, [key])
    } catch { /* ignore */ }
  },
}