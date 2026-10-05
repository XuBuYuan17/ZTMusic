/** pidof exits 1 until Android has created the launcher process. */
export async function waitForProcess(readPid, { timeout = 15000, interval = 150, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const deadline = now() + timeout
  do {
    let value = ''
    try { value = readPid() } catch (error) {
      if (error.status !== 1) throw error
    }
    const pid = String(value).trim().split(/\s+/).find(value => /^[1-9]\d*$/.test(value))
    if (pid) return Number(pid)
    await pause(interval)
  } while (now() < deadline)
  throw new Error(`Android launcher process did not appear within ${timeout}ms`)
}

/** A process/socket can exist before WebView has a usable DevTools page target. */
export async function connectReadyWebView(device, pid, readStartupLog, { timeout = 20000, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const deadline = Date.now() + timeout
  const frame = new RegExp('\\s' + pid + '\\s+\\d+\\s+I ZTStartup: first-frame-ready')
  while (!frame.test(readStartupLog())) {
    if (Date.now() >= deadline) throw new Error('Native first frame timeout before inspector connection')
    await pause(150)
  }
  let timer
  try {
    return await Promise.race([
      (async () => {
        const view = await device.webView({ socketName: 'webview_devtools_remote_' + pid })
        return await view.page()
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('WebView inspector connection timeout for PID ' + pid)), timeout) }),
    ])
  } finally { clearTimeout(timer) }
}
