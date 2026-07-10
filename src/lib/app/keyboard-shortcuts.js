/**
 * PC 端全局键盘快捷键
 *
 * 仅在桌面布局下生效；在输入框 / 可编辑元素聚焦时自动忽略，避免干扰打字。
 *
 * 快捷键：
 *   空格 / K       播放 / 暂停
 *   ← / →          快退 / 快进 5 秒
 *   Ctrl/⌘ + ← / → 上一首 / 下一首
 *   ↑ / ↓          音量 +/- 5%
 *   M              静音 / 取消静音
 *   J / L          快退 / 快进 10 秒
 */

const SEEK_STEP = 5
const SEEK_STEP_LARGE = 10
const VOLUME_STEP = 0.05

function isEditableTarget(el) {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

/**
 * 安装全局键盘快捷键。
 * @param {object} opts
 * @param {object} opts.player - 播放器单例
 * @param {() => boolean} opts.isMobile - 是否移动布局（移动端不启用）
 * @returns {() => void} 卸载函数
 */
export function installKeyboardShortcuts({ player, isMobile }) {
  if (typeof window === 'undefined') return () => {}

  let lastVolume = player.volume > 0 ? player.volume : 0.8

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v))
  }

  function seekBy(delta) {
    if (!player.id) return
    const dur = player.duration > 0 ? player.duration / 1000 : Infinity
    player.seek(clamp((player.currentTime || 0) + delta, 0, dur))
  }

  function changeVolume(delta) {
    const next = clamp((player.volume || 0) + delta, 0, 1)
    if (next > 0) lastVolume = next
    player.setVolume(next)
  }

  function toggleMute() {
    if (player.volume > 0) {
      lastVolume = player.volume
      player.setVolume(0)
    } else {
      player.setVolume(lastVolume || 0.8)
    }
  }

  function handleKeyDown(e) {
    if (isMobile?.()) return
    if (isEditableTarget(e.target)) return
    if (e.altKey) return

    const withMod = e.ctrlKey || e.metaKey

    switch (e.key) {
      case ' ':
      case 'k':
      case 'K':
        e.preventDefault()
        player.togglePlay()
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (withMod) player.prev()
        else seekBy(-SEEK_STEP)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (withMod) player.next()
        else seekBy(SEEK_STEP)
        break
      case 'ArrowUp':
        e.preventDefault()
        changeVolume(VOLUME_STEP)
        break
      case 'ArrowDown':
        e.preventDefault()
        changeVolume(-VOLUME_STEP)
        break
      case 'j':
      case 'J':
        e.preventDefault()
        seekBy(-SEEK_STEP_LARGE)
        break
      case 'l':
      case 'L':
        e.preventDefault()
        seekBy(SEEK_STEP_LARGE)
        break
      case 'm':
      case 'M':
        e.preventDefault()
        toggleMute()
        break
      default:
        break
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}
