<script lang="ts">
  import { dialogFocus } from '../app/desktop-motion.ts'
  import { mobileDrag } from '../app/mobile-interaction.ts'
  import { sheetCoverTransform, mobilePlayerTiming, playerDragProgress, finishPlayerDrag, type MobilePlayerDrag } from '../app/mobile-player-motion.ts'
  import AppleMusicPlayer from './AppleMusicPlayer.svelte'

  interface LyricsOrigin { x?: number; y?: number; top?: number; right?: number; bottom?: number; left?: number; radius?: number }
  let { show = false, startupPending = false, origin = null, drag = null, onClose, onOpenArtist, onOpenAlbum, onOpenPlaylist, onToggleTheme }: {
    startupPending?: boolean
    drag?: MobilePlayerDrag | null
    show?: boolean
    origin?: LyricsOrigin | null
    onClose?: () => void
    onOpenArtist?: (id: number | null) => void
    onOpenAlbum?: (id: number | null) => void
    onOpenPlaylist?: (id: number | null) => void
    onToggleTheme?: (event?: MouseEvent) => void
  } = $props()
  let showLocalQueue = $state(false)
  let closing = $state(false)
  let root = $state<HTMLElement | null>(null)
  let sheet = $state<HTMLElement | null>(null)
  let backdrop = $state<HTMLElement | null>(null)
  const sheetTiming = { ...mobilePlayerTiming, fill: 'both' as FillMode }
  const animations = new Set<Animation>()
  let generation = 0
  let settleFrame: number | undefined
  let stopPull: (() => void) | null = null
  const ghosts = new Set<HTMLElement>()
  function animate(node: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = node.animate(frames, options)
    animations.add(animation)
    return animation
  }
  function cancelAnimations() { if (settleFrame != null) cancelAnimationFrame(settleFrame); generation++; animations.forEach(animation => animation.cancel()); animations.clear(); ghosts.forEach(node => node.remove()); ghosts.clear() }
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function coverFrames(cover: HTMLElement, destination: { left: number; top: number; width: number; height: number }, verticalOffset = 0) {
    const rect = cover.getBoundingClientRect()
    return { transform: sheetCoverTransform(rect, destination, verticalOffset), ...(!document.documentElement.classList.contains('mobile-runtime') ? { borderRadius: '12px' } : {}) }
  }

  function miniClip() {
    const rect = document.querySelector<HTMLElement>('.mobile-mini-player')?.getBoundingClientRect()
    return rect ? `inset(${Math.max(0, rect.top)}px ${Math.max(0, innerWidth - rect.right)}px ${Math.max(0, innerHeight - rect.bottom)}px ${Math.max(0, rect.left)}px round 0px)` : 'inset(100% 0px 0px 0px round 0px)'
  }

  function miniGhost() {
    const mini = document.querySelector<HTMLElement>('.mobile-mini-player')
    if (!mini || !sheet) return null
    const rect = mini.getBoundingClientRect(), parent = sheet.getBoundingClientRect()
    const ghost = mini.cloneNode(true) as HTMLElement
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    ghost.querySelector<HTMLElement>('.mini-player-artwork')?.style.setProperty('visibility', 'hidden')
    Object.assign(ghost.style, { position: 'absolute', inset: 'auto', left: `${rect.left - parent.left}px`, top: `${rect.top - parent.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, minHeight: `${rect.height}px`, margin: '0', padding: getComputedStyle(mini).padding, background: 'transparent', border: '0', boxShadow: 'none', borderRadius: '0', visibility: 'visible', zIndex: '20', pointerEvents: 'none' })
    sheet.append(ghost)
    ghosts.add(ghost)
    return ghost
  }

  function enter(node: HTMLElement) {
    closing = false
    showLocalQueue = false
    const mobile = document.documentElement.classList.contains('mobile-runtime')
    const gesture = drag
    let ready = false
    let following = !!gesture
    let progress = 0
    let velocity = gesture ? (gesture.currentY - gesture.startY) / Math.max(1, gesture.time - gesture.startTime) : 0
    let lastY = gesture?.currentY ?? 0
    let lastTime = gesture?.time ?? performance.now()
    const travel = document.querySelector('.mobile-mini-player')?.getBoundingClientRect().top ?? innerHeight
    const seek = (value: number) => {
      progress = value
      for (const animation of animations) { animation.pause(); animation.currentTime = value * mobilePlayerTiming.duration }
    }
    const release = () => {
      if (!gesture || !ready || !following) return
      following = false
      stopPull?.()
      const recentVelocity = performance.now() - lastTime < 120 ? velocity : 0
      const expand = finishPlayerDrag(progress, recentVelocity, gesture.startY - gesture.currentY, gesture.cancelled)
      const from = progress, to = expand ? 1 : 0
      const duration = reduced() ? 0 : Math.max(100, 320 * Math.abs(to - from))
      const started = performance.now()
      const settle = (now: number) => {
        const fraction = duration ? Math.min(1, (now - started) / duration) : 1
        seek(from + (to - from) * (1 - (1 - fraction) ** 3))
        if (fraction < 1) settleFrame = requestAnimationFrame(settle)
        else if (expand) animations.forEach(animation => animation.finish())
        else onClose?.()
      }
      settleFrame = requestAnimationFrame(settle)
    }
    const movePointer = (event: PointerEvent) => {
      if (!gesture || !following || event.pointerId !== gesture.pointerId) return
      if (event.clientY !== lastY) {
        velocity = (event.clientY - lastY) / Math.max(1, event.timeStamp - lastTime)
        lastY = event.clientY; lastTime = event.timeStamp
      }
      gesture.currentY = event.clientY
      gesture.time = event.timeStamp
      if (ready) seek(playerDragProgress(gesture.startY, gesture.currentY, travel))
    }
    const finishPointer = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return
      movePointer(event)
      gesture.released = true
      gesture.cancelled = event.type !== 'pointerup'
      release()
    }
    stopPull = () => {
      following = false
      window.removeEventListener('pointermove', movePointer, true)
      window.removeEventListener('pointerup', finishPointer, true)
      window.removeEventListener('pointercancel', finishPointer, true)
    }
    if (gesture) {
      window.addEventListener('pointermove', movePointer, true)
      window.addEventListener('pointerup', finishPointer, true)
      window.addEventListener('pointercancel', finishPointer, true)
    }
    if (mobile) node.style.visibility = 'hidden'
    const frame = requestAnimationFrame(() => {
      const cover = node.querySelector<HTMLElement>('.am-flying-cover')
      if (mobile) {
        const mini = document.querySelector<HTMLElement>('.mini-player-artwork')
        const nav = document.querySelector<HTMLElement>('.mobile-tab-bar')
        document.documentElement.classList.add('mobile-player-expanded')
        if (!reduced() || gesture) {
          const timing = gesture ? { ...sheetTiming, easing: 'linear' } : sheetTiming
          const ghost = miniGhost()
          if (ghost) animate(ghost, [{ opacity: 1 }, { opacity: 0, offset: .18 }, { opacity: 0 }], timing)
          if (sheet) animate(sheet, [{ clipPath: miniClip() }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], timing)
          if (nav) animate(nav, [{ transform: 'translateY(0%)' }, { transform: 'translateY(100%)' }], timing)
          if (backdrop) animate(backdrop, [{ opacity: 0 }, { opacity: 1 }], timing)
          if (cover && mini) animate(cover, [coverFrames(cover, mini.getBoundingClientRect()), { transform: 'none' }], timing)
          const background = node.querySelector<HTMLElement>('.am-bg')
          if (background) animate(background, [{ opacity: 0 }, { opacity: 1, offset: .16 }, { opacity: 1 }], timing)
          const miniRect = mini?.getBoundingClientRect()
          const coverRect = cover ? { bottom: cover.offsetTop + cover.offsetHeight } : null
          const contentOffset = miniRect && coverRect ? Math.max(24, miniRect.bottom - coverRect.bottom) : 24
          node.querySelectorAll<HTMLElement>('.am-track-info, .am-corner-info, .am-bottom-controls, .am-mobile-footer, .am-more-shell, .am-mobile-like').forEach(element => {
            animate(element, [{ opacity: 0, transform: `translateY(${contentOffset}px)` }, { opacity: 1, transform: 'none' }], timing)
          })
          if (gesture) {
            ready = true
            seek(playerDragProgress(gesture.startY, gesture.currentY, travel))
            if (gesture.released) release()
          }
          const version = generation
          Promise.all([...animations].map(animation => animation.finished)).then(() => { if (version === generation) cancelAnimations() }).catch(() => {})
        }
        node.style.visibility = ''
        return
      }
      if (reduced()) return
      animate(node,[{ opacity: 0 }, { opacity: 1 }], { duration: 220 })
      if (cover && origin?.left != null && origin.top != null) {
        animate(cover,[coverFrames(cover, { left: origin.left, top: origin.top, width: window.innerWidth - origin.left - (origin.right ?? 0), height: window.innerHeight - origin.top - (origin.bottom ?? 0) }), { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' })
      } else animate(node,[{ translate: '0 100%' }, { translate: '0 0' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' })
    })
    return { destroy() {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', movePointer, true)
      window.removeEventListener('pointerup', finishPointer, true)
      window.removeEventListener('pointercancel', finishPointer, true)
      document.documentElement.classList.remove('mobile-player-expanded')
      cancelAnimations()
    } }
  }

  function close() {
    if (closing) return
    closing = true
    stopPull?.()
    showLocalQueue = false
    const cover = root?.querySelector<HTMLElement>('.am-flying-cover')
    const mobile = document.documentElement.classList.contains('mobile-runtime')
    const mini = document.querySelector<HTMLElement>(mobile ? '.mini-player-artwork' : '.lcd-artwork__img')
    const fromCover = cover ? getComputedStyle(cover).transform : 'none'
    const visualCover = cover?.getBoundingClientRect()
    const fromTranslate = sheet ? getComputedStyle(sheet).translate : 'none'
    const sheetTop = sheet?.getBoundingClientRect().top ?? 0
    const fromClip = sheet ? getComputedStyle(sheet).clipPath : 'none'
    const nav = document.querySelector<HTMLElement>('.mobile-tab-bar')
    const navFrom = nav ? getComputedStyle(nav).transform : 'none'
    const background = root?.querySelector<HTMLElement>('.am-bg')
    const backgroundFrom = background ? getComputedStyle(background).opacity : '1'
    const backdropFrom = backdrop ? getComputedStyle(backdrop).opacity : '1'
    const previousGhost = [...ghosts][0]
    const ghostFrom = previousGhost ? getComputedStyle(previousGhost).opacity : '0'
    const content = [...(root?.querySelectorAll<HTMLElement>('.am-track-info, .am-corner-info, .am-bottom-controls, .am-mobile-footer, .am-more-shell, .am-mobile-like, .am-lyrics-area') ?? [])]
      .map(element => ({ element, opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform }))
    root?.querySelector('.apple-music-player')?.dispatchEvent(new Event('mobile-player-dismiss'))
    cancelAnimations()
    if (!root || reduced()) { onClose?.(); return }
    if (mobile && cover && mini && sheet) {
      sheet.style.translate = '0 0'
      const ghost = miniGhost()
      if (ghost) animate(ghost, [{ opacity: ghostFrom }, { opacity: 0, offset: .5 }, { opacity: 1 }], sheetTiming)
      const base = cover.getBoundingClientRect()
      const destination = mini.getBoundingClientRect()
      animate(cover, [
        { transform: visualCover ? sheetCoverTransform(base, visualCover, sheetTop) : fromCover },
        { transform: sheetCoverTransform(base, destination) },
      ], sheetTiming)
      const collapse = animate(sheet, [
        { clipPath: fromClip === 'none' ? 'inset(0px 0px 0px 0px round 0px)' : fromClip, translate: fromTranslate === 'none' ? '0 0' : fromTranslate },
        { clipPath: miniClip(), translate: '0 0' },
      ], sheetTiming)
      if (nav) animate(nav, [{ transform: sheetTop ? `${navFrom === 'none' ? '' : navFrom} translateY(${sheetTop}px)` : navFrom }, { transform: 'translateY(0%)' }], sheetTiming)
      if (backdrop) animate(backdrop, [{ opacity: backdropFrom }, { opacity: 0 }], sheetTiming)
      if (background) animate(background, [{ opacity: backgroundFrom }, { opacity: 0 }], sheetTiming)
      const contentOffset = Math.max(24, destination.bottom - base.bottom)
      content.forEach(({ element, opacity, transform }) => {
        animate(element, [{ opacity, transform }, { opacity: 0, transform: `translateY(${contentOffset}px)` }], sheetTiming)
      })
      collapse.finished.then(() => onClose?.()).catch(() => {})
      return
    }
    if (cover && mini) {
      animate(cover,[{ transform: 'none' }, coverFrames(cover, mini.getBoundingClientRect())], { duration: 360, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
      const fade = animate(root,[{ opacity: 1 }, { opacity: 0 }], { duration: 360, fill: 'forwards' })
      fade.finished.then(() => onClose?.()).catch(() => {})
    } else {
      const slide = animate(root, [{ translate: root.style.translate || '0 0' }, { translate: '0 100%' }], { duration: 360, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
      slide.finished.then(() => onClose?.()).catch(() => {})
    }
  }
</script>

{#if show}
  <div class="ly-fullscreen mounted entered" aria-busy={startupPending} class:closing={closing && !document.documentElement.classList.contains('mobile-runtime')} bind:this={root} use:enter use:dialogFocus={close} role="dialog" aria-modal="true" aria-label="正在播放" tabindex="-1">
    <div class="m-player-backdrop" bind:this={backdrop}></div>
    <div class="ly-container" bind:this={sheet}>
      <AppleMusicPlayer onClose={close} {onOpenArtist} {onOpenAlbum} {onOpenPlaylist} {onToggleTheme} {showLocalQueue} toggleLocalQueue={() => showLocalQueue = !showLocalQueue} />
      <button class="m-player-dismiss" aria-label="收起播放器" onclick={close} use:mobileDrag={{ close, target: () => sheet, blocked: () => showLocalQueue }}><span></span></button>
    </div>
  </div>
{/if}

<style>
  .m-player-backdrop { display: none; }
  :global(html.mobile-runtime) .m-player-backdrop { display: block; position: absolute; inset: 0; background: rgb(0 0 0 / .45); }
</style>
