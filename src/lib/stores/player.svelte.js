/**
 * 播放器状态 — 向后兼容桥接层
 *
 * 此文件作为旧版 import 的兼容入口，将所有导出委托给新的模块化 player。
 * 新代码应直接 import from '../player/store.js'。
 *
 * 导出：
 *   - player     — PlayerState 单例（.id, .title, .playTrack(), .next() 等）
 *   - getLocalHistory — 获取播放历史
 *   - clearHistory    — 清空播放历史
 */

import { player } from '../player/store.svelte.js'
import { getLocalHistory, clearHistory } from '../player/history.js'

export { player, getLocalHistory, clearHistory }

export default player
