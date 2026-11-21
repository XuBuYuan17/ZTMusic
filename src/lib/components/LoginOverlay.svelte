<script lang="ts">
  import { dialogFocus, desktopPanel, desktopFeedback } from '../app/desktop-motion.ts'
  import QRCode from 'qrcode'
  import { tick } from 'svelte'
  import { auth } from '../stores/auth.svelte.ts'
  import { fade } from 'svelte/transition'
  import Spinner from './Spinner.svelte'

  type LoginMode = 'qr' | 'phone' | 'email'

  let { showLogin = false, onClose, onLoginSuccess }: {
    showLogin?: boolean
    onClose?: () => void
    onLoginSuccess?: () => void
  } = $props()

  let mode = $state<LoginMode>('qr')
  let phone = $state('')
  let email = $state('')
  let password = $state('')
  let qrImg = $state('')
  let qrUrl = $state('')
  let qrStatus = $state('')
  let processing = $state(false)
  let error = $state('')
  let qrCancel: (() => void) | undefined
  let pollActive = $state(false)
  let qrRequestId = 0
  let loginRequestId = 0
  let phoneInput = $state<HTMLInputElement | null>(null)
  let emailInput = $state<HTMLInputElement | null>(null)
  let tabPointer: number | null = null
  let suppressTabClickUntil = 0

  $effect(() => {
    if (showLogin && mode === 'qr') startQr()
    return () => { qrCancel?.(); pollActive = false; qrRequestId += 1 }
  })

  // 切换模式后自动 focus 到输入框
  $effect(() => {
    if (!showLogin) return
    if (mode === 'phone') tick().then(() => phoneInput?.focus())
    else if (mode === 'email') tick().then(() => emailInput?.focus())
  })

  async function startQr(): Promise<void> {
    const requestId = ++qrRequestId
    qrImg = ''
    qrStatus = '获取二维码...'
    error = ''
    pollActive = false
    qrCancel?.()
    qrCancel = undefined
    try {
      const { key, qrurl, qrimg } = await auth.getQrCode()
      if (requestId !== qrRequestId || mode !== 'qr' || !showLogin) return
      if (!qrurl && !qrimg) { error = '二维码生成失败，请切换手机号登录'; return }
      qrUrl = qrurl
      qrImg = qrurl
        ? await QRCode.toDataURL(qrurl, { width: 256, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
        : qrimg
      if (requestId !== qrRequestId || mode !== 'qr' || !showLogin) return
      qrStatus = '请使用网易云音乐APP扫码'
      pollActive = true

      const { promise, cancel } = auth.startQrPolling(key, (code: unknown) => {
        if (requestId !== qrRequestId) return
        if (code === 801) qrStatus = '请使用网易云音乐APP扫码'
        else if (code === 802) qrStatus = '已扫码，请在手机上确认'
        else if (code === 803) qrStatus = '授权登录成功，正在获取账号信息...'
        else if (code === 800) qrStatus = '二维码已过期，请点击重新获取'
      })
      qrCancel = cancel
      const cookie = await promise
      if (requestId !== qrRequestId) return
      pollActive = false
      await auth.qrLogin(cookie)
      if (requestId !== qrRequestId) return
      onLoginSuccess?.()
      onClose?.()
    } catch (e) {
      if (requestId !== qrRequestId) return
      pollActive = false
      error = (e as { message?: string } | null | undefined)?.message || '二维码登录失败'
      qrStatus = ''
    }
  }

  async function handleLogin() {
    if (processing) return
    processing = true
    error = ''
    const requestId = ++loginRequestId
    try {
      if (mode === 'phone') {
        if (!/^1[3-9]\d{9}$/.test(phone)) { error = '请输入有效的手机号'; processing = false; return }
        if (!password) { error = '请输入密码'; processing = false; return }
        await auth.login('phone', { phone, password })
      } else if (mode === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error = '请输入有效的邮箱'; processing = false; return }
        if (!password) { error = '请输入密码'; processing = false; return }
        await auth.login('email', { email, password })
      }
      if (requestId !== loginRequestId) return
      password = ''
      onLoginSuccess?.()
      onClose?.()
    } catch (e) {
      if (requestId !== loginRequestId) return
      error = (e as { message?: string } | null | undefined)?.message || '登录失败'
    }
    processing = false
  }

  function switchMode(m: LoginMode): void {
    mode = m
    error = ''
    qrStatus = ''
    qrCancel?.()
    qrRequestId += 1
    pollActive = false
  }

  function holdTabFocus(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || !e.isPrimary || !(document.activeElement instanceof HTMLInputElement)) return
    tabPointer = e.pointerId
    e.preventDefault()
  }

  function releaseTabFocus(e: PointerEvent, nextMode: LoginMode): void {
    if (e.pointerId !== tabPointer) return
    tabPointer = null
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (e.clientX >= bounds.left && e.clientX <= bounds.right && e.clientY >= bounds.top && e.clientY <= bounds.bottom) {
      suppressTabClickUntil = Date.now() + 500
      switchMode(nextMode)
    }
  }

  function suppressFollowupClick(e: MouseEvent): boolean {
    if (e.detail === 0 || Date.now() > suppressTabClickUntil) return false
    suppressTabClickUntil = 0
    e.preventDefault()
    e.stopPropagation()
    return true
  }

  function handleOverlayKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.() }
  }

  function stopEvent(e: MouseEvent | KeyboardEvent): void {
    if ('key' in e && e.key === 'Escape') return  // 让 Escape 能穿透关闭
    e.stopPropagation()
  }
</script>

{#if showLogin}
  <div class="login-overlay" transition:fade={{ duration: 200 }} role="button" tabindex="0" aria-label="关闭登录窗口" onclick={(e) => { if (!suppressFollowupClick(e)) onClose?.() }} onkeydown={handleOverlayKeyDown}>
    <div class="login-card" transition:desktopPanel use:dialogFocus={() => onClose?.()} use:desktopFeedback role="dialog" tabindex="-1" aria-modal="true" aria-label="登录" onclick={stopEvent} onkeydown={stopEvent}>
      <button class="close-btn" type="button" onclick={onClose} aria-label="关闭">✕</button>

      <div class="login-header">
        <h2>登录</h2>
      </div>

      <div class="tabs">
        <button class="tab" class:active={mode === 'qr'} aria-pressed={mode === 'qr'} onpointerdown={holdTabFocus} onpointerup={(e) => releaseTabFocus(e, 'qr')} onpointercancel={() => tabPointer = null} onclick={(e) => { if (!suppressFollowupClick(e)) switchMode('qr') }}>扫码</button>
        <button class="tab" class:active={mode === 'phone'} aria-pressed={mode === 'phone'} onpointerdown={holdTabFocus} onpointerup={(e) => releaseTabFocus(e, 'phone')} onpointercancel={() => tabPointer = null} onclick={(e) => { if (!suppressFollowupClick(e)) switchMode('phone') }}>手机号</button>
        <button class="tab" class:active={mode === 'email'} aria-pressed={mode === 'email'} onpointerdown={holdTabFocus} onpointerup={(e) => releaseTabFocus(e, 'email')} onpointercancel={() => tabPointer = null} onclick={(e) => { if (!suppressFollowupClick(e)) switchMode('email') }}>邮箱</button>
      </div>

      <div class="login-body">
        {#if mode === 'qr'}
          <div class="qr-section">
            <div class="qr-frame">
              {#if qrImg}
                <img class="qr-img" src={qrImg} alt="网易云音乐登录二维码" />
              {:else if qrStatus && !error}
                  <Spinner size="lg" />
              {:else}
                <span class="qr-unavailable" aria-hidden="true">⌁</span>
              {/if}
            </div>
            {#if qrStatus}
              <p class="qr-status" role="status">{qrStatus}</p>
            {/if}
            {#if qrImg}
              {#if qrUrl}<details class="qr-fallback"><summary>无法扫码？查看登录链接</summary><span class="qr-url-fallback">{qrUrl}</span></details>{/if}
              {#if qrStatus.includes('已过期')}<button class="retry-btn" onclick={startQr}>重新获取二维码</button>{/if}
            {/if}
            {#if error}
              <p class="login-error">{error}</p>
              <button class="retry-btn" onclick={startQr}>重新获取二维码</button>
            {/if}
          </div>

        {:else if mode === 'phone'}
          <div class="form">
            <label>手机号<input class="input" type="tel" autocomplete="tel" placeholder="请输入手机号" bind:value={phone} bind:this={phoneInput} /></label>
            <label>密码<input class="input" type="password" autocomplete="current-password" placeholder="请输入密码" bind:value={password} onkeydown={(e) => e.key === 'Enter' && !processing && handleLogin()} /></label>
            {#if error}<p class="login-error">{error}</p>{/if}
            <button class="login-btn" onclick={handleLogin} disabled={processing}>
              {processing ? '登录中...' : '登录'}
            </button>
          </div>

        {:else if mode === 'email'}
          <div class="form">
            <label>邮箱<input class="input" type="email" autocomplete="username" placeholder="请输入邮箱" bind:value={email} bind:this={emailInput} /></label>
            <label>密码<input class="input" type="password" autocomplete="current-password" placeholder="请输入密码" bind:value={password} onkeydown={(e) => e.key === 'Enter' && !processing && handleLogin()} /></label>
            {#if error}<p class="login-error">{error}</p>{/if}
            <button class="login-btn" onclick={handleLogin} disabled={processing}>
              {processing ? '登录中...' : '登录'}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .login-overlay {
    position: fixed; inset: 0; z-index: 600;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(4px);
  }
  .login-card {
    background: var(--bg-surface);
    border-radius: var(--radius-lg);
    padding: 32px 32px 28px;
    width: 384px;
    max-width: 90vw;
    position: relative;
    box-shadow: 0 16px 48px rgba(0,0,0,0.2);
  }
  .close-btn {
    position: absolute; top: 16px; right: 16px;
    width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%;
    font-size: 18px; color: var(--text-secondary); background: transparent; border: none; cursor: pointer;
  }
  .close-btn:hover { color: var(--text); background: var(--bg-elevated); }
  .login-header { display: flex; align-items: center; min-height: 42px; margin-bottom: 26px; padding-right: 42px; }
  .login-header h2 { font-size: 21px; font-weight: 700; margin: 0; }
  .tabs {
    display: flex; gap: 2px; margin-bottom: 26px;
    background: var(--bg-elevated); border-radius: var(--radius-md); padding: 4px;
  }
  .tab {
    flex: 1; padding: 10px 8px; border-radius: var(--radius-md);
    font-size: 13px; font-weight: 500; color: var(--text-secondary);
    transition: background-color 150ms, color 150ms, box-shadow 150ms; cursor: pointer; background: none; border: none;
  }
  .tab.active { background: var(--bg-surface); color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .qr-section { text-align: center; padding: 4px 0 0; }
  .qr-frame { width: min(220px, 100%); aspect-ratio: 1; margin: 0 auto; display: grid; place-items: center; padding: 12px; border-radius: var(--radius-lg); background: #fff; border: 1px solid var(--border); box-shadow: 0 8px 24px color-mix(in srgb, var(--text) 5%, transparent); }
  .qr-img { width: 100%; height: 100%; display: block; }
  .qr-unavailable { color: #888; font-size: 32px; }

  .qr-status { margin-top: 18px; font-size: 13px; color: var(--text-secondary); }
  .qr-fallback { margin-top: 12px; font-size: 11px; color: var(--text-secondary); }
  .qr-fallback summary { cursor: pointer; }
  .qr-url-fallback { display: block; font-size: 10px; word-break: break-all; color: var(--text-disabled); margin-top: 4px; user-select: all; }
  .retry-btn { margin-top: 12px; padding: 6px 20px; border-radius: var(--radius-lg); font-size: 12px; color: var(--accent); background: var(--accent-bg); border: none; cursor: pointer; transition: opacity 0.15s; }
  .retry-btn:hover { opacity: 0.8; }
  .form { display: flex; flex-direction: column; gap: 16px; }
  .form label { display: flex; flex-direction: column; gap: 8px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
  .input {
    width: 100%; padding: 12px 14px; border-radius: var(--radius-md);
    background: var(--bg-elevated); border: 1px solid var(--border);
    color: var(--text); font-size: 14px; outline: none;
    transition: border-color 0.2s;
  }
  .input:focus { border-color: var(--accent); }
  .login-btn {
    margin-top: 4px; padding: 12px; border-radius: 999px;
    background: var(--accent); color: #fff;
    font-size: 14px; font-weight: 500;
    transition: opacity 0.15s; border: none; cursor: pointer;
  }
  .login-btn:hover { opacity: 0.9; }
  .login-btn:disabled { opacity: 0.5; cursor: default; }
  .login-error { font-size: 12px; color: #ff4444; text-align: center; margin-top: 8px; }
  .close-btn:focus-visible, .tab:focus-visible, .retry-btn:focus-visible, .login-btn:focus-visible, .qr-fallback summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  :global(html.mobile-runtime) .login-card { background: var(--bg-surface); }
  :global(html.mobile-runtime) .login-card .tabs { border-radius: var(--radius-md); background: var(--md-container); }
  :global(html.mobile-runtime) .login-card .tab { border-radius: var(--radius-md); }
  :global(html.mobile-runtime) .login-card .tab.active { color: var(--md-primary); background: var(--bg-surface); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  :global(html.mobile-runtime) .login-card .close-btn { background: transparent; }
  @media (prefers-reduced-motion: reduce) { .tab, .input, .retry-btn, .login-btn { transition: none; } }
</style>
