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
 *
 * 原生媒体键（Linux WebKitGTK 上由 DE 转发，部分 Sway/Hyprland 不转发到 WebView 时
 *  仍能通过 keydown 兜底；Web Media Session 不会触发这些 keydown）：
 *   MediaPlayPause / MediaTrackNext / MediaTrackPrevious / MediaStop
 */

const SEEK_STEP = 5
const SEEK_STEP_LARGE = 10
const VOLUME_STEP = 0.05

// 简单帮助面板状态
let _helpEl: HTMLElement | null = null
let _helpStyleInjected = false

function showShortcutsHelp(): void {
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
  ;(el.querySelector('.shortcuts-help-close') as HTMLElement).onclick = close
  el.onclick = (e: MouseEvent) => { if (e.target === el) close() }
}

function injectHelpStyle(): void {
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
      background: var(--bg-surface); border-radius: var(--radius-lg); padding: 24px 28px;
      min-width: 320px; max-width: 90vw; box-shadow: 0 24px 60px rgba(0,0,0,0.3);
    }
    .shortcuts-help-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .shortcuts-help-header h2 { font-size: 18px; font-weight: 700; color: var(--text); margin: 0; }
    .shortcuts-help-close { background: none; border: none; font-size: 24px; color: var(--text-secondary); cursor: pointer; padding: 0 4px; }
    .shortcuts-help-list { display: grid; gap: 8px; }
    .shortcuts-help-row { display: flex; align-items: center; gap: 8px; color: var(--text); font-size: 14px; }
    .shortcuts-help-row span { margin-left: auto; color: var(--text-secondary); }
    .shortcuts-help-row kbd {
      display: inline-block; padding: 2px 8px; border-radius: var(--radius-xs); font-size: 12px;
      background: var(--bg-elevated); border: 1px solid var(--border);
      font-family: ui-monospace, monospace; min-width: 20px; text-align: center;
    }
    @keyframes shFadeIn { from { opacity: 0; } to { opacity: 1; } }
  `
  document.head.appendChild(style)
}

interface EditableTarget {
  tagName?: string
  isContentEditable?: boolean
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el) return false
  const target = el as unknown as EditableTarget
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

interface ShortcutsPlayer {
  id: number | string
  duration: number
  currentTime: number
  volume: number
  togglePlay(): void
  next(): void
  prev(): void
  pause(): void
  seek(time: number): void
  setVolume(volume: number): void
}

interface KeyboardShortcutsOptions {
  player: ShortcutsPlayer
  isMobile?: () => boolean
}

/**
 * 安装全局键盘快捷键。
 * @returns 卸载函数
 */
export function installKeyboardShortcuts({ player, isMobile }: KeyboardShortcutsOptions): () => void {
  if (typeof window === 'undefined') return () => {}

  let lastVolume = player.volume > 0 ? player.volume : 0.8

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v))
  }

  function seekBy(delta: number): void {
    if (!player.id) return
    const dur = player.duration > 0 ? player.duration : Infinity
    player.seek(clamp((player.currentTime || 0) + delta, 0, dur))
  }

  function changeVolume(delta: number): void {
    const next = clamp((player.volume || 0) + delta, 0, 1)
    if (next > 0) lastVolume = next
    player.setVolume(next)
  }

  function toggleMute(): void {
    if (player.volume > 0) {
      lastVolume = player.volume
      player.setVolume(0)
    } else {
      player.setVolume(lastVolume || 0.8)
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
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
      // Linux 媒体键兜底：DE 不把 XF86Audio* 转发给 WebKitGTK 时，
      // 部分版本会翻译为 MediaPlayPause 等 keydown 事件。
      // Windows / macOS 不会触发这些 keydown（Web Media Session 自己消费）。
      case 'MediaPlayPause':
        e.preventDefault()
        player.togglePlay()
        break
      case 'MediaTrackNext':
        e.preventDefault()
        player.next()
        break
      case 'MediaTrackPrevious':
        e.preventDefault()
        player.prev()
        break
      case 'MediaStop':
        e.preventDefault()
        player.pause()
        break
      default:
        break
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}
