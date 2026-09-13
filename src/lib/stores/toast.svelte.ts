/**
 * Toast — 全局轻量通知
 *
 * 使用:
 *   import { toast } from '../stores/toast.svelte.ts'
 *   toast.show('已添加到歌单')
 *   toast.show('网络错误，请重试', 'error')
 *   toast.show('登录已过期', 'warning')
 *
 * 类型: 'info' (默认) | 'success' | 'warning' | 'error'
 */
export type ToastType = 'info' | 'success' | 'warning' | 'error'

let _message = $state('')
let _type = $state<ToastType>('info')
let _visible = $state(false)
let _timer: ReturnType<typeof setTimeout> | null = null
let _seq = 0

function show(message: string, type: ToastType = 'info', duration = 2500): void {
  if (_timer) clearTimeout(_timer)
  _message = message
  _type = type
  _seq++
  _visible = true
  _timer = setTimeout(() => {
    _visible = false
    _timer = null
  }, duration)
}

function hide(): void {
  if (_timer) clearTimeout(_timer)
  _visible = false
  _timer = null
}

export const toast = {
  get message() { return _message },
  get type() { return _type },
  get visible() { return _visible },
  get seq() { return _seq },
  show,
  hide,
  success: (msg: string) => show(msg, 'success'),
  error: (msg: string) => show(msg, 'error'),
  warning: (msg: string) => show(msg, 'warning'),
  info: (msg: string) => show(msg, 'info'),
}
