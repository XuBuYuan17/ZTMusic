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
