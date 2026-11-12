import { isAndroidRuntime, isTauriRuntime } from './runtime.ts'

export async function openExternal(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Invalid external URL')
  if (!isTauriRuntime()) {
    window.open(url.href, '_blank', 'noopener,noreferrer')
    return
  }
  const { invoke } = await import('@tauri-apps/api/core')
  if (isAndroidRuntime()) await invoke('plugin:zt-player|execute', { payload: { action: 'openExternal', data: { url: url.href } } })
  else await invoke('open_external_url', { url: url.href })
}
