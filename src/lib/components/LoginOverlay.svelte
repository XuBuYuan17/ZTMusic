<script>
  import { auth } from '../stores/auth.svelte.js'
  import { fade } from 'svelte/transition'
  import Spinner from './Spinner.svelte'

  let { showLogin = false, onClose, onLoginSuccess } = $props()

  let mode = $state('qr')
  let phone = $state('')
  let email = $state('')
  let password = $state('')
  let qrImg = $state('')
  let qrUrl = $state('')
  let qrStatus = $state('')
  let processing = $state(false)
  let error = $state('')
  let qrCancel
  let pollActive = $state(false)

  $effect(() => {
    if (showLogin && mode === 'qr') startQr()
    return () => { qrCancel?.(); pollActive = false }
  })

  async function startQr() {
    qrImg = ''
    qrStatus = '获取二维码...'
    error = ''
    pollActive = false
    qrCancel?.()
    qrCancel = undefined
    try {
      const { key, qrurl, qrimg } = await auth.getQrCode()
      if (!qrimg) { error = '二维码生成失败，请切换手机号登录'; return }
      qrImg = qrimg
      qrUrl = qrurl
      qrStatus = '请使用网易云音乐APP扫码'
      pollActive = true

      const { promise, cancel } = auth.startQrPolling(key, (code) => {
          if (code === 801) qrStatus = '已扫码，请在手机上确认'
          else if (code === 802) qrStatus = '登录成功，正在保存信息...'
          else if (code === 800) { qrStatus = '二维码已过期，重新获取...'; startQr() }
      })
      qrCancel = cancel
      await promise
      pollActive = false
      await auth.qrLogin()
      onLoginSuccess?.()
      onClose?.()
    } catch (e) {
      pollActive = false
      error = e.message || '二维码登录失败'
      qrStatus = ''
    }
  }

  async function handleLogin() {
    processing = true
    error = ''
    try {
      if (mode === 'phone') {
        if (!phone || !password) { error = '请填写手机号和密码'; processing = false; return }
        await auth.login('phone', { phone, password })
      } else if (mode === 'email') {
        if (!email || !password) { error = '请填写邮箱和密码'; processing = false; return }
        await auth.login('email', { email, password })
      }
      onLoginSuccess?.()
      onClose?.()
    } catch (e) {
      error = e.message || '登录失败'
    }
    processing = false
  }

  function switchMode(m) {
    mode = m
    error = ''
    qrStatus = ''
    qrCancel?.()
    pollActive = false
    if (m === 'qr') startQr()
  }

  function handleOverlayKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClose?.()
    }
  }

  function stopEvent(e) {
    e.stopPropagation()
  }
</script>

{#if showLogin}
  <div class="login-overlay" transition:fade={{ duration: 200 }} role="button" tabindex="0" aria-label="关闭登录窗口" onclick={onClose} onkeydown={handleOverlayKeyDown}>
    <div class="login-card" role="dialog" tabindex="-1" aria-modal="true" aria-label="登录" onclick={stopEvent} onkeydown={stopEvent}>
      <button class="close-btn" onclick={onClose} aria-label="关闭">✕</button>

      <div class="login-header">
        <h2>登录</h2>
        <p>登录网易云音乐账号</p>
      </div>

      <div class="tabs">
        <button class="tab" class:active={mode === 'qr'} onclick={() => switchMode('qr')}>扫码</button>
        <button class="tab" class:active={mode === 'phone'} onclick={() => switchMode('phone')}>手机号</button>
        <button class="tab" class:active={mode === 'email'} onclick={() => switchMode('email')}>邮箱</button>
      </div>

      <div class="login-body">
        {#if mode === 'qr'}
          <div class="qr-section">
            {#if qrImg}
              <img class="qr-img" src={qrImg} alt="QR code" />
            {:else if qrStatus && !error}
              <div class="qr-placeholder">
                  <Spinner size="lg" />
              </div>
            {/if}
            {#if qrStatus}
              <p class="qr-status">{qrStatus}</p>
            {/if}
            {#if qrImg}
              <div class="qr-hint">打开网易云音乐APP - 扫一扫登录<br><span class="qr-url-fallback">{qrUrl}</span></div>
            {/if}
            {#if error}
              <p class="login-error">{error}</p>
              <button class="retry-btn" onclick={startQr}>重新获取二维码</button>
            {/if}
          </div>

        {:else if mode === 'phone'}
          <div class="form">
            <input class="input" type="tel" placeholder="手机号" bind:value={phone} />
            <input class="input" type="password" placeholder="密码" bind:value={password} onkeydown={(e) => e.key === 'Enter' && handleLogin()} />
            {#if error}<p class="login-error">{error}</p>{/if}
            <button class="login-btn" onclick={handleLogin} disabled={processing}>
              {processing ? '登录中...' : '登录'}
            </button>
          </div>

        {:else if mode === 'email'}
          <div class="form">
            <input class="input" type="email" placeholder="邮箱" bind:value={email} />
            <input class="input" type="password" placeholder="密码" bind:value={password} onkeydown={(e) => e.key === 'Enter' && handleLogin()} />
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
    border-radius: 16px;
    padding: 32px;
    width: 380px;
    max-width: 90vw;
    position: relative;
    box-shadow: 0 16px 48px rgba(0,0,0,0.2);
  }
  .close-btn {
    position: absolute; top: 12px; right: 16px;
    font-size: 18px; color: var(--text-secondary);
    background: none; border: none; cursor: pointer;
  }
  .close-btn:hover { color: var(--text); }
  .login-header { text-align: center; margin-bottom: 24px; }
  .login-header h2 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .login-header p { font-size: 13px; color: var(--text-secondary); }
  .tabs {
    display: flex; gap: 0; margin-bottom: 24px;
    background: var(--bg-elevated); border-radius: 10px; padding: 3px;
  }
  .tab {
    flex: 1; padding: 8px; border-radius: 8px;
    font-size: 13px; font-weight: 500; color: var(--text-secondary);
    transition: all 0.2s; cursor: pointer; background: none; border: none;
  }
  .tab.active { background: var(--bg-surface); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .qr-section { text-align: center; padding: 8px 0; }
  .qr-img { width: 200px; height: 200px; border-radius: 8px; margin: 0 auto; display: block; }
  .qr-placeholder { width: 200px; height: 200px; margin: 0 auto; display: flex; align-items: center; justify-content: center; }

  .qr-status { margin-top: 12px; font-size: 13px; color: var(--text-secondary); }
  .qr-hint { margin-top: 8px; font-size: 11px; color: var(--text-tertiary); line-height: 1.5; }
  .qr-url-fallback { display: block; font-size: 10px; word-break: break-all; color: var(--text-disabled); margin-top: 4px; user-select: all; }
  .retry-btn { margin-top: 12px; padding: 6px 20px; border-radius: 16px; font-size: 12px; color: var(--accent); background: var(--accent-bg); border: none; cursor: pointer; transition: opacity 0.15s; }
  .retry-btn:hover { opacity: 0.8; }
  .form { display: flex; flex-direction: column; gap: 12px; }
  .input {
    padding: 12px 14px; border-radius: 10px;
    background: var(--bg-elevated); border: 1px solid var(--divider);
    color: var(--text); font-size: 14px; outline: none;
    transition: border-color 0.2s;
  }
  .input:focus { border-color: var(--accent); }
  .login-btn {
    padding: 12px; border-radius: 10px;
    background: var(--accent); color: #fff;
    font-size: 14px; font-weight: 600;
    transition: opacity 0.15s; border: none; cursor: pointer;
  }
  .login-btn:hover { opacity: 0.9; }
  .login-btn:disabled { opacity: 0.5; cursor: default; }
  .login-error { font-size: 12px; color: #ff4444; text-align: center; margin-top: 8px; }
</style>
