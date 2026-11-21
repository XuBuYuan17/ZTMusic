<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import QRCode from 'qrcode'
  import { apiSession } from '../api/session.ts'
  import { auth } from '../stores/auth.svelte.ts'
  import {
    closeDevicePairing, decodeDevicePairingCode, devicePairingBackend, devicePairingConfigured,
    devicePairingVerification, readDevicePairing, startDevicePairing, submitDevicePairing,
    type DevicePairingCode, type DevicePairingReceiver,
  } from '../services/device-pairing.ts'
  import {
    collectDeviceMigration, importDeviceMigration, validateDeviceMigration,
    type DeviceDataSelection, type DeviceMigration,
  } from '../services/device-migration.ts'

  type QrDetector = {
    detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
  }
  type QrDetectorClass = {
    new(options: { formats: string[] }): QrDetector
    getSupportedFormats(): Promise<string[]>
  }

  let { role, onComplete }: { role: 'receive' | 'approve'; onComplete?: () => void } = $props()
  let qrImage = $state('')
  let visibleCode = $state('')
  let codeText = $state('')
  let checkCode = $state('')
  let pasted = $state('')
  let pairing = $state<DevicePairingCode | null>(null)
  let selection = $state<DeviceDataSelection>({ history: false, listening: false, groups: false, settings: false })
  let error = $state('')
  let busy = $state(false)
  let sent = $state(false)
  let receivedName = $state('')
  let receivedParts = $state<string[]>([])
  let importResult = $state<{ imported: string[]; failed: string[] } | null>(null)
  let video = $state<HTMLVideoElement>()
  let scanning = $state(false)
  let stream: MediaStream | undefined
  let scanVersion = 0
  let scanTimer: ReturnType<typeof setTimeout> | undefined
  let polling: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let receiver: DevicePairingReceiver | undefined
  let payload: DeviceMigration | undefined

  const dataOptions = [
    { key: 'history', label: '本机在线歌曲播放历史' },
    { key: 'listening', label: '本机在线歌曲听歌统计' },
    { key: 'groups', label: '自定义歌单分组' },
    { key: 'settings', label: '主题、底栏和常用设置' },
  ] as const

  function detachReceiver(): void {
    if (polling) clearTimeout(polling)
    polling = undefined
    const current = receiver
    receiver = undefined
    if (current) void closeDevicePairing(current).catch(() => {})
  }

  function clearReceived(): void {
    payload = undefined
    receivedName = ''
    receivedParts = []
  }

  function stopCamera(): void {
    scanVersion++
    if (scanTimer) clearTimeout(scanTimer)
    stream?.getTracks().forEach(track => track.stop())
    stream = undefined
    scanning = false
  }

  onMount(() => { if (role === 'receive' && devicePairingConfigured) void generate() })
  onDestroy(() => {
    controller?.abort()
    stopCamera()
    detachReceiver()
    clearReceived()
  })

  async function generate(): Promise<void> {
    controller?.abort()
    detachReceiver()
    clearReceived()
    const request = controller = new AbortController()
    qrImage = ''
    visibleCode = ''
    checkCode = ''
    error = ''
    busy = true
    try {
      if (auth.isLoggedIn) throw new Error('请先退出新设备上的已有账号')
      const current = await startDevicePairing(apiSession.getBase(), request.signal)
      if (request.signal.aborted) { void closeDevicePairing(current).catch(() => {}); return }
      receiver = current
      checkCode = await devicePairingVerification(current.value)
      const image = await QRCode.toDataURL(current.code, { width: 244, margin: 3, errorCorrectionLevel: 'M' })
      if (request.signal.aborted) return
      qrImage = image
      codeText = current.code
      void poll(current, request.signal)
    } catch (e) {
      if (!request.signal.aborted) error = e instanceof Error ? e.message : '生成配对二维码失败'
      if (receiver && controller === request) detachReceiver()
    } finally { if (controller === request) busy = false }
  }

  async function poll(current: DevicePairingReceiver, signal: AbortSignal): Promise<void> {
    try {
      if (current.value.expires <= Date.now()) throw new Error('配对二维码已过期，请重新生成')
      const result = await readDevicePairing(current, signal)
      if (signal.aborted || receiver !== current) return
      if (!result) {
        polling = setTimeout(() => void poll(current, signal), 1500)
        return
      }
      payload = validateDeviceMigration(result)
      receivedName = payload.nickname
      receivedParts = dataOptions.filter(option => Boolean(payload?.[option.key])).map(option => option.label)
      qrImage = ''
      visibleCode = ''
      codeText = ''
    } catch (e) {
      if (!signal.aborted && receiver === current) {
        error = e instanceof Error ? e.message : '读取配对数据失败'
        qrImage = ''
        visibleCode = ''
        codeText = ''
        detachReceiver()
      }
    }
  }

  async function finishLogin(): Promise<void> {
    if (busy || !payload || !controller) return
    if (!receiver || receiver.value.expires <= Date.now()) {
      clearReceived()
      detachReceiver()
      error = '配对已过期，请重新生成二维码'
      return
    }
    const data = payload
    const request = controller
    error = ''
    busy = true
    try {
      await auth.acceptPairedSession(data.cookie, data.userId, request.signal)
      detachReceiver()
      clearReceived()
      importResult = await importDeviceMigration(data)
    } catch (e) {
      if (!request.signal.aborted) error = e instanceof Error ? e.message : '配对登录失败'
    } finally { busy = false }
  }

  async function readCode(raw: string): Promise<boolean> {
    error = ''
    pairing = null
    checkCode = ''
    try {
      const details = decodeDevicePairingCode(raw)
      if (details.backend !== await devicePairingBackend(apiSession.getBase())) {
        throw new Error('两台设备的网易云 API 地址不同，请先核对后端设置')
      }
      checkCode = await devicePairingVerification(details)
      pairing = details
      pasted = ''
      return true
    } catch (e) {
      error = e instanceof Error ? e.message : '读取配对码失败'
      return false
    }
  }

  async function startCamera(): Promise<void> {
    error = ''
    const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: QrDetectorClass }).BarcodeDetector
    const version = ++scanVersion
    let captured: MediaStream | undefined
    try {
      if (!Detector || !navigator.mediaDevices || !(await Detector.getSupportedFormats()).includes('qr_code')) {
        throw new Error('当前设备的扫码能力不可用，可以复制并粘贴新设备的配对码')
      }
      if (version !== scanVersion) return
      const detector = new Detector({ formats: ['qr_code'] })
      captured = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
      if (version !== scanVersion) { captured.getTracks().forEach(track => track.stop()); return }
      stream = captured
      scanning = true
      await tick()
      if (!video || !scanning) { stopCamera(); return }
      video.srcObject = captured
      await video.play()
      async function sample(): Promise<void> {
        if (version !== scanVersion || !video) return
        try {
          const [result] = await detector.detect(video)
          if (version !== scanVersion) return
          if (result && await readCode(result.rawValue)) { stopCamera(); return }
          if (result) { stopCamera(); return }
        } catch { /* A camera frame may not be ready yet. */ }
        if (version === scanVersion) scanTimer = setTimeout(() => void sample(), 240)
      }
      void sample()
    } catch (e) {
      if (version !== scanVersion) return
      stopCamera()
      error = e instanceof Error ? e.message : '无法开启相机，请粘贴配对码'
    }
  }

  async function approve(): Promise<void> {
    if (!pairing || busy || sent) return
    const request = controller = new AbortController()
    busy = true
    error = ''
    try {
      const data = await collectDeviceMigration(selection)
      request.signal.throwIfAborted()
      if (pairing.backend !== await devicePairingBackend(apiSession.getBase())) throw new Error('旧设备 API 地址已变化')
      if (pairing.expires <= Date.now()) throw new Error('配对已过期，请在新设备重新生成二维码')
      await submitDevicePairing(pairing, data, request.signal)
      sent = true
      pairing = null
    } catch (e) {
      if (!request.signal.aborted) error = e instanceof Error ? e.message : '授权发送失败'
    } finally { busy = false }
  }
</script>

<div class="device-pairing">
  {#if !devicePairingConfigured}
    <p>此版本尚未配置设备配对服务。</p>
  {:else if role === 'receive'}
    {#if importResult}
      <strong>已登录新设备</strong>
      {#each importResult.imported as result}<div>{result}</div>{/each}
      {#if importResult.failed.length}<p role="status">未能导入：{importResult.failed.join('、')}</p>{/if}
      <button type="button" onclick={onComplete}>完成</button>
    {:else if receivedName}
      <strong>「{receivedName}」请求登录此设备</strong>
      <p>{receivedParts.length ? '会迁移：' + receivedParts.join('、') : '本次只迁移登录会话。'}</p>
      <button type="button" onclick={finishLogin} disabled={busy}>{busy ? '正在验证账号…' : '确认登录'}</button>
      <button type="button" class="subtle" onclick={generate} disabled={busy}>取消并重新配对</button>
    {:else if qrImage}
      <p>在旧设备打开「设置 → 数据与账号 → 授权另一台哲听」扫描。</p>
      <img src={qrImage} alt="哲听设备配对二维码" class="device-qr" />
      <strong class="verification">验证码 {checkCode}</strong>
      <p>请在旧设备核对验证码。配对有效期为 3 分钟。</p>
      <button type="button" class="subtle" onclick={() => visibleCode = codeText}>显示可复制的配对码</button>
      {#if visibleCode}<textarea readonly rows="2" aria-label="可复制的配对码" value={visibleCode}></textarea>{/if}
    {:else}
      <button type="button" onclick={generate} disabled={busy}>{busy ? '生成二维码中…' : '生成配对二维码'}</button>
    {/if}
  {:else if sent}
    <strong>已发送授权，请在新设备确认登录</strong>
  {:else if pairing}
    <strong>确认新设备显示验证码 {checkCode}</strong>
    <p>授权后，新设备可使用「{auth.user?.nickname || '当前账号'}」的登录会话。</p>
    <fieldset>
      <legend>可选的迁移数据</legend>
      {#each dataOptions as option (option.key)}
        <label><input type="checkbox" bind:checked={selection[option.key]} disabled={busy} />{option.label}</label>
      {/each}
    </fieldset>
    <button type="button" onclick={approve} disabled={busy}>{busy ? '正在加密并发送…' : '验证码一致，授权新设备'}</button>
    <button type="button" class="subtle" onclick={() => pairing = null} disabled={busy}>取消</button>
  {:else}
    {#if scanning}
      <video bind:this={video} playsinline muted aria-label="相机扫码预览"></video>
      <button type="button" onclick={stopCamera}>关闭相机</button>
    {:else}
      <button type="button" onclick={startCamera}>扫描新设备二维码</button>
    {/if}
    <label class="pairing-code-label">或粘贴新设备的配对码
      <textarea bind:value={pasted} rows="2" maxlength="1024"></textarea>
    </label>
    <button type="button" class="subtle" onclick={() => readCode(pasted)} disabled={!pasted.trim()}>读取配对码</button>
  {/if}
  {#if error}<p class="pairing-error" role="alert">{error}</p>{/if}
</div>

<style>
  .device-pairing { display: grid; justify-items: start; gap: 10px; min-width: 0; padding: 12px 0; color: var(--text); font-size: 14px; }
  p { color: var(--text-secondary); }
  button { min-height: 44px; padding: 8px 16px; border-radius: var(--radius-md); background: var(--accent-bg); color: var(--accent); text-align: start; }
  button:disabled { opacity: .5; }
  button.subtle { background: transparent; }
  textarea { width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); }
  .pairing-code-label, fieldset { width: 100%; display: grid; gap: 8px; border: 0; }
  fieldset label { display: flex; align-items: center; gap: 8px; min-height: 32px; }
  .device-qr { width: min(244px, 100%); aspect-ratio: 1; border-radius: var(--radius-md); justify-self: center; }
  .verification { justify-self: center; font-variant-numeric: tabular-nums; letter-spacing: .08em; }
  video { max-height: 220px; width: 100%; border-radius: var(--radius-md); object-fit: cover; background: #111; }
  .pairing-error { color: var(--danger); }
</style>
