<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { createSplashGate, MAX_SPLASH_MS } from '../app/startup-splash.ts'
  import { isTauriRuntime, runtimePlatform } from '../utils/runtime.ts'
  import { preloadCover } from '../utils/image.ts'
  import StartupArtwork from './StartupArtwork.svelte'

  let { ready, failed = false, coverSource = '', onFinish }: {
    ready: boolean
    failed?: boolean
    coverSource?: string
    onFinish: () => void
  } = $props()
  const android = isTauriRuntime() && /Android/i.test(runtimePlatform())
  let visible = $state(!android)
  let restored = $state(!android)
  let canAnimate = $state(true)
  let exiting = $state(false)
  let album = $state('')
  let root: HTMLDivElement
  let cover: HTMLDivElement
  let target: HTMLElement | null = null
  let targetVisibility = ''
  let destroyed = false
  let finished = false
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined
  const animations = new Set<Animation>()
  const reduced = () => !canAnimate || matchMedia('(prefers-reduced-motion: reduce)').matches
  const gate = createSplashGate(timedOut => { void handoff(timedOut) })

  function complete() {
    if (finished || destroyed) return
    finished = true
    clearTimeout(cleanupTimer)
    if (target) target.style.visibility = targetVisibility
    performance.mark('ztmusic:splash-finished')
    onFinish()
    void tick().then(() => {
      const focus = document.querySelector<HTMLElement>('.ly-fullscreen') ?? document.querySelector<HTMLElement>('.mobile-page-bar button')
      focus?.focus({ preventScroll: true })
    })
  }

  async function handoff(timedOut: boolean) {
    if (destroyed || exiting) return
    cleanupTimer = setTimeout(complete, 1400)
    try {
      await tick()
      if (destroyed || finished) return
      target = timedOut || failed ? null : document.querySelector<HTMLElement>('.mobile-mini-player [data-startup-cover]')
      targetVisibility = target?.style.visibility || ''
      const from = cover.getBoundingClientRect()
      const to = target?.getBoundingClientRect()
      const image = target?.querySelector<HTMLImageElement>('img')
      if (!album && image?.complete && image.naturalWidth > 0) album = image.currentSrc
      exiting = true
      performance.mark('ztmusic:splash-exiting')
      await tick()
      if (destroyed || finished) return
      if (reduced() || document.hidden) { complete(); return }
      const timing = { duration: 820, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' as FillMode }
      if (target && to && to.width > 0 && to.height > 0) {
        target.style.visibility = 'hidden'
        Object.assign(cover.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, translate: '0 0', transformOrigin: '0 0' })
        animations.add(cover.animate([
          { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, borderRadius: '50%' },
          { transform: 'none', borderRadius: getComputedStyle(target).borderRadius, boxShadow: getComputedStyle(target).boxShadow },
        ], timing))
      } else animations.add(cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'both' }))
      animations.add(root.querySelector<HTMLElement>('.startup-atmosphere')!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, delay: 100, fill: 'both' }))
      await Promise.all([...animations].map(animation => animation.finished))
      complete()
    } catch (error) {
      console.warn('[startup-splash] 交接失败，解除开屏', error)
      complete()
    }
  }

  $effect(() => { if (ready && (restored || failed)) gate.ready() })
  $effect(() => {
    const source = coverSource
    let active = true
    album = ''
    if (source) void preloadCover(source, 400).then(url => { if (active) album = url || '' })
    return () => { active = false }
  })
  onMount(() => {
    let observer: PerformanceObserver | undefined
    const reveal = (event?: Event) => {
      if (visible) return
      canAnimate = (event as CustomEvent<{ animate?: boolean }> | undefined)?.detail?.animate !== false
      visible = true
      performance.mark('ztmusic:splash-visible')
      gate.start()
    }
    const finishInterrupted = () => { if (exiting) complete() }
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const changeMotion = () => { if (motion.matches && exiting) complete() }
    const syncRestored = () => { if (performance.getEntriesByName('ztmusic:android-state-restored').length) restored = true }
    if (android) {
      window.addEventListener('ztmusic:android-reveal', reveal)
      syncRestored()
      observer = new PerformanceObserver(syncRestored)
      observer.observe({ type: 'mark', buffered: true })
      if (performance.getEntriesByName('ztmusic:system-splash-exit').length) reveal()
    } else {
      performance.mark('ztmusic:splash-visible')
      gate.start()
    }
    // Native has an 8s reveal watchdog; this also bounds a missing JS notification.
    const revealTimeout = android ? setTimeout(() => gate.skip(), 8000 + MAX_SPLASH_MS) : undefined
    window.addEventListener('resize', finishInterrupted)
    document.addEventListener('visibilitychange', finishInterrupted)
    motion.addEventListener('change', changeMotion)
    root.focus({ preventScroll: true })
    return () => {
      destroyed = true
      gate.destroy()
      clearTimeout(revealTimeout)
      clearTimeout(cleanupTimer)
      observer?.disconnect()
      window.removeEventListener('ztmusic:android-reveal', reveal)
      window.removeEventListener('resize', finishInterrupted)
      document.removeEventListener('visibilitychange', finishInterrupted)
      motion.removeEventListener('change', changeMotion)
      if (target) target.style.visibility = targetVisibility
      animations.forEach(animation => animation.cancel())
    }
  })
</script>

<div class="startup-splash" class:visible class:exiting class:still={!canAnimate} bind:this={root} data-startup-splash tabindex="-1" role="region" aria-label="哲听正在启动" aria-busy={!exiting}>
  <div class="startup-atmosphere">
    <div class="grain" aria-hidden="true"></div><div class="vignette" aria-hidden="true"></div><div class="ambient" aria-hidden="true"></div>
    <div class="hero"><div class="logo" aria-label="ZT"><span>Z</span><span>T</span></div><div class="kicker">MUSIC PLAYER</div></div>
    <div class="ring" aria-hidden="true"></div>
    <div class="eq" aria-hidden="true">{#each Array(23) as _, i}<i style={`--delay:${-(i % 4) * .2}s`}></i>{/each}</div>
    {#each [[22,31],[77,35],[72,57],[27,58],[15,46]] as point, i}<span class="particle" aria-hidden="true" style={`left:${point[0]}%;top:${point[1]}%;--delay:${i * .3}s`}></span>{/each}
    <div class="status" role="status"><div class="prayer">少女祈祷中</div><div class="substatus">正在唤醒播放器</div><div class="loading" aria-hidden="true"><i></i></div></div>
  </div>
  <div class="startup-cover" bind:this={cover} aria-hidden="true">
    <div class="album"><StartupArtwork />{#if album}<img src={album} alt="" referrerpolicy="no-referrer" onerror={() => album = ''} />{/if}</div>
    <div class="vinyl"></div>
  </div>
</div>

<style>
  .startup-splash { --pink: #ff4f75; --pink2: #ff9eb2; --ease: cubic-bezier(.22,1,.36,1); position: fixed; inset: 0; z-index: 2000; overflow: hidden; isolation: isolate; color: #f7f4f8; font-family: var(--font); outline: none; }
  .startup-atmosphere { position: absolute; inset: 0; background: radial-gradient(circle at 50% 42%, rgb(255 79 117 / .15), transparent 30%), radial-gradient(circle at 50% 88%, rgb(141 108 255 / .12), transparent 34%), linear-gradient(180deg,#120d18,#09080d); }
  .grain { position: absolute; inset: 0; opacity: .045; background-image: radial-gradient(#fff .7px, transparent .7px); background-size: 8px 8px; }
  .vignette { position: absolute; inset: 0; background: radial-gradient(circle at 50% 44%, transparent 20%, rgb(0 0 0 / .56) 92%); }
  .ambient { position: absolute; left: 50%; top: 43%; width: min(330px, 90vw); aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; background: radial-gradient(circle, rgb(255 79 117 / .24), rgb(255 79 117 / .06) 49%, transparent 71%); animation: breath 3.4s ease-in-out infinite; }
  .startup-cover { position: absolute; z-index: 6; left: 50%; top: 43%; width: min(218px, 56vw, 34dvh); aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; overflow: hidden; box-shadow: 0 0 0 1px rgb(255 255 255 / .07), 0 0 60px rgb(255 53 92 / .36), 0 22px 55px rgb(0 0 0 / .28); opacity: 0; animation: coverIn .92s .1s var(--ease) forwards; }
  .vinyl, .album { position: absolute; inset: 0; transition: opacity .48s ease; }
  .vinyl { background: radial-gradient(circle, #0d0b11 0 9px, #f5eef5 10px 13px, #24151f 14px 25px, transparent 26px), repeating-radial-gradient(circle, rgb(255 255 255 / .075) 0 1px, rgb(0 0 0 / .08) 1px 6px), conic-gradient(from 10deg,#761027,#ff6c7e,#c41f42,#ff9ca3,#81162d,#ff4e69,#6d0d22); animation: spin 9s linear infinite; }
  .vinyl::before { content: ''; position: absolute; inset: 23px; border-radius: 50%; border: 1px solid rgb(255 255 255 / .09); box-shadow: 0 0 0 24px rgb(255 255 255 / .012), 0 0 0 48px rgb(255 255 255 / .01); }
  .vinyl::after { content: '♪'; position: absolute; left: 50%; top: 50%; translate: -50% -50%; width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; font-size: 25px; font-weight: 700; background: linear-gradient(145deg,#ff879c,#d52550); box-shadow: 0 0 18px rgb(255 79 117 / .48); }
  .album { opacity: 0; }
  .album img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .ring { position: absolute; left: 50%; top: 43%; translate: -50% -50%; width: min(286px, 74vw, 44dvh); aspect-ratio: 1; border-radius: 50%; border: 1px solid rgb(255 255 255 / .08); opacity: 0; animation: ringIn .8s .35s var(--ease) forwards; }
  .ring::before, .ring::after { content: ''; position: absolute; border-radius: 50%; }
  .ring::before { inset: 16px; border: 1px dashed rgb(255 154 178 / .22); animation: spin 24s linear infinite reverse; }
  .ring::after { inset: -14px; border: 1px solid rgb(156 236 255 / .08); }
  .eq { position: absolute; left: 50%; top: 43%; translate: -50% -50%; width: min(324px, 84vw); height: 100px; display: flex; justify-content: space-between; align-items: center; opacity: 0; animation: eqIn .4s .82s forwards; }
  .eq i { width: 3px; height: 45px; border-radius: 999px; background: linear-gradient(#fff,var(--pink2)); box-shadow: 0 0 8px rgb(255 79 117 / .35); animation: equalize 1.05s ease-in-out var(--delay) infinite; }
  .hero { position: absolute; z-index: 8; top: max(12.5%, calc(24px + env(safe-area-inset-top))); left: 0; right: 0; text-align: center; }
  .logo { display: inline-flex; gap: 3px; font-size: clamp(48px, 16vw, 64px); font-weight: 700; line-height: 1; letter-spacing: -.08em; }
  .logo span { display: inline-block; opacity: 0; animation: logoIn .58s 1.02s var(--ease) forwards; }
  .logo span + span { animation-delay: 1.13s; }
  .kicker { margin-top: 8px; font-size: 10px; font-weight: 500; letter-spacing: .34em; text-indent: .34em; color: rgb(255 255 255 / .45); opacity: 0; animation: fadeUp .5s 1.42s forwards; }
  .status { position: absolute; z-index: 8; left: 0; right: 0; bottom: max(12.6%, calc(48px + env(safe-area-inset-bottom))); text-align: center; }
  .prayer { font-size: 14px; font-weight: 500; letter-spacing: .2em; text-indent: .2em; color: rgb(255 255 255 / .82); opacity: 0; animation: fadeUp .48s 1.38s forwards; }
  .substatus { margin-top: 9px; font-size: 10px; letter-spacing: .12em; color: rgb(255 255 255 / .34); opacity: 0; animation: fadeUp .45s 1.58s forwards; }
  .loading { width: 72px; height: 2px; margin: 16px auto 0; border-radius: 999px; background: rgb(255 255 255 / .08); overflow: hidden; opacity: 0; animation: fadeUp .4s 1.68s forwards; }
  .loading i { display: block; width: 36%; height: 100%; background: linear-gradient(90deg,transparent,var(--pink2),#fff); animation: sweep 1.1s ease-in-out 1.75s infinite; }
  .particle { position: absolute; z-index: 4; width: 5px; height: 5px; border-radius: 50%; background: #fff; box-shadow: 0 0 12px 3px rgb(255 255 255 / .36); opacity: 0; animation: twinkle 2.5s ease-in-out var(--delay) infinite; }
  .exiting .startup-cover { animation: none; opacity: 1; }
  .exiting .vinyl { opacity: 0; }
  .exiting .album { opacity: 1; }
  .startup-splash:not(.visible) * { animation-play-state: paused; }
  .still *, .still *::before, .still *::after { animation: none !important; transition: none !important; }
  .still :is(.startup-cover, .ring, .eq, .logo span, .kicker, .prayer, .substatus, .loading) { opacity: 1; }
  @keyframes coverIn { from { opacity: 0; transform: translateY(28px) scale(.78); } to { opacity: 1; transform: none; } }
  @keyframes ringIn { from { opacity: 0; transform: scale(.72) rotate(-14deg); } to { opacity: 1; transform: none; } }
  @keyframes logoIn { 0% { opacity: 0; translate: 0 -28px; scale: .72; } 70% { opacity: 1; translate: 0 4px; scale: 1.06; } 100% { opacity: 1; translate: 0 0; scale: 1; } }
  @keyframes fadeUp { from { opacity: 0; translate: 0 11px; } to { opacity: 1; translate: 0 0; } }
  @keyframes eqIn { to { opacity: .82; } }
  @keyframes equalize { 0%,100% { scale: 1 .2; opacity: .36; } 45% { scale: 1 1; opacity: 1; } 72% { scale: 1 .42; opacity: .68; } }
  @keyframes breath { 50% { scale: 1.07; opacity: .78; } }
  @keyframes spin { to { rotate: 360deg; } }
  @keyframes twinkle { 0%,100% { opacity: 0; scale: .2; } 44% { opacity: 1; scale: 1; } 70% { opacity: 0; scale: 1.8; } }
  @keyframes sweep { from { transform: translateX(-180%); } to { transform: translateX(360%); } }
  @media (prefers-reduced-motion: reduce) {
    .startup-splash *, .startup-splash *::before, .startup-splash *::after { animation: none !important; transition: none !important; }
    .startup-cover, .ring, .eq, .logo span, .kicker, .prayer, .substatus, .loading { opacity: 1; }
    .eq i { scale: 1 .3; }
  }
</style>
