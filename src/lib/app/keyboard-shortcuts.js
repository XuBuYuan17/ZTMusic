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
 *   ?              显示快捷键帮助
 */

const SEEK_STEP = 5
const SEEK_STEP_LARGE = 10
const VOLUME_STEP = 0.05

// 简单帮助面板状态
let _helpEl = null
let _helpStyleInjected = false

function showShortcutsHelp() {
  if (_helpEl) {
    _helpEl.remove()
    _helpEl = null
    return
  }
  injectHelpStyle()
  const el = document.createElement('div')
  el.className = 'shortcuts-help-backdrop'
  el.innerHTML = `
    <div class="shortcuts-help-panel" role="dialog" aria-label="键盘快捷键">
      <div class="shortcuts-help-header">
        <h2>键盘快捷键</h2>
        <button class="shortcuts-help-close" aria-label="关闭">&times;</button>
      </div>
      <div class="shortcuts-help-list">
        <div class="shortcuts-help-row"><kbd>空格</kbd> / <kbd>K</kbd><span>播放 / 暂停</span></div>
        <div class="shortcuts-help-row"><kbd>←</kbd> / <kbd>→</kbd><span>快退 / 快进 5 秒</span></div>
        <div class="shortcuts-help-row"><kbd>Ctrl</kbd>+<kbd>←</kbd> / <kbd>→</kbd><span>上一首 / 下一首</span></div>
        <div class="shortcuts-help-row"><kbd>↑</kbd> / <kbd>↓</kbd><span>音量 +/- 5%</span></div>
        <div class="shortcuts-help-row"><kbd>M</kbd><span>静音 / 取消静音</span></div>
        <div class="shortcuts-help-row"><kbd>J</kbd> / <kbd>L</kbd><span>快退 / 快进 10 秒</span></div>
        <div class="shortcuts-help-row"><kbd>?</kbd><span>显示 / 隐藏此面板</span></div>
      </div>
    </div>
  `
  document.body.appendChild(el)
  _helpEl = el
  const close = () => { el.remove(); _helpEl = null }
  el.querySelector('.shortcuts-help-close').onclick = close
  el.onclick = (e) => { if (e.target === el) close() }
}

function injectHelpStyle() {
  if (_helpStyleInjected) return
  _helpStyleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .shortcuts-help-backdrop {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;
      animation: shFadeIn 0.15s ease;
    }
    .shortcuts-help-panel {
      background: var(--bg-surface); border-radius: 16px; padding: 24px 28px;
      min-width: 320px; max-width: 90vw; box-shadow: 0 24px 60px rgba(0,0,0,0.3);
    }
    .shortcuts-help-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .shortcuts-help-header h2 { font-size: 18px; font-weight: 700; color: var(--text); margin: 0; }
    .shortcuts-help-close { background: none; border: none; font-size: 24px; color: var(--text-secondary); cursor: pointer; padding: 0 4px; }
    .shortcuts-help-list { display: grid; gap: 8px; }
    .shortcuts-help-row { display: flex; align-items: center; gap: 8px; color: var(--text); font-size: 14px; }
    .shortcuts-help-row span { margin-left: auto; color: var(--text-secondary); }
    .shortcuts-help-row kbd {
      display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 12px;
      background: var(--bg-elevated); border: 1px solid var(--border);
      font-family: ui-monospace, monospace; min-width: 20px; text-align: center;
    }
    @keyframes shFadeIn { from { opacity: 0; } to { opacity: 1; } }
  `
  document.head.appendChild(style)
}

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
    const dur = player.duration > 0 ? player.duration : Infinity
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
      case '?':
        e.preventDefault()
        showShortcutsHelp()
        break
      default:
        break
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}
