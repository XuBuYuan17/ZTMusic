interface BackListener { unregister: () => Promise<void> }
type RegisterBack = (handler: () => void) => Promise<BackListener>

export function subscribeAndroidBack(handler: () => void, register: RegisterBack = async callback => {
  const { onBackButtonPress } = await import('@tauri-apps/api/app')
  return onBackButtonPress(callback)
}): () => void {
  let disposed = false
  let listener: BackListener | undefined
  const report = (error: unknown) => console.error('[android-back]', error)
  register(() => { if (!disposed) handler() }).then(value => {
    if (disposed) void value.unregister().catch(report)
    else listener = value
  }).catch(report)
  return () => {
    if (disposed) return
    disposed = true
    if (listener) void listener.unregister().catch(report)
  }
}
