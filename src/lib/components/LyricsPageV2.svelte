<script lang="ts">
  import { dialogFocus } from '../app/desktop-motion.ts'
  import { sheetCoverTransform } from '../app/mobile-player-motion.ts'
  import type { PlayerSurfaceController } from '../player-motion/controller.ts'
  import { playerSurfaceGesture } from '../player-motion/gesture.ts'
  import { renderPlayerSurface } from '../player-motion/renderer.ts'
  import AppleMusicPlayer from './AppleMusicPlayer.svelte'

  interface LyricsOrigin { x?: number; y?: number; top?: number; right?: number; bottom?: number; left?: number; radius?: number }
  let { show = false, origin = null, controller, onClose, onOpenArtist, onOpenAlbum, onOpenPlaylist, onToggleTheme }: {
    controller?: PlayerSurfaceController
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
  const animations = new Set<Animation>()
  function animate(node: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = node.animate(frames, options)
    animations.add(animation)
    return animation
  }
  function cancelAnimations() { animations.forEach(animation => animation.cancel()); animations.clear() }
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function coverFrames(cover: HTMLElement, destination: { left: number; top: number; width: number; height: number }, verticalOffset = 0) {
    const rect = cover.getBoundingClientRect()
    return { transform: sheetCoverTransform(rect, destination, verticalOffset), ...(!document.documentElement.classList.contains('mobile-runtime') ? { borderRadius: '12px' } : {}) }
  }

  function enter(node: HTMLElement) {
    closing = false
    showLocalQueue = false
    if (controller) return renderPlayerSurface(node, controller)
    const frame = requestAnimationFrame(() => {
      const cover = node.querySelector<HTMLElement>('.am-flying-cover')
      if (reduced()) return
      animate(node,[{ opacity: 0 }, { opacity: 1 }], { duration: 220 })
      if (cover && origin?.left != null && origin.top != null) {
        animate(cover,[coverFrames(cover, { left: origin.left, top: origin.top, width: window.innerWidth - origin.left - (origin.right ?? 0), height: window.innerHeight - origin.top - (origin.bottom ?? 0) }), { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' })
      } else animate(node,[{ translate: '0 100%' }, { translate: '0 0' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' })
    })
    return { destroy() {
      cancelAnimationFrame(frame)
      cancelAnimations()
    } }
  }

  function close() {
    if (controller) { controller.close(); return }
    if (closing) return
    closing = true
    showLocalQueue = false
    const cover = root?.querySelector<HTMLElement>('.am-flying-cover')
    const mini = document.querySelector<HTMLElement>('.lcd-artwork__img')
    root?.querySelector('.apple-music-player')?.dispatchEvent(new Event('mobile-player-dismiss'))
    cancelAnimations()
    if (!root || reduced()) { onClose?.(); return }
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
  <div class="ly-fullscreen mounted entered" class:closing={closing && !document.documentElement.classList.contains('mobile-runtime')} bind:this={root} use:enter use:dialogFocus={close} role="dialog" aria-modal="true" aria-label="正在播放" tabindex="-1">
    <div class="m-player-backdrop"></div>
    <div class="ly-container">
      <AppleMusicPlayer surfaceController={controller} onClose={close} {onOpenArtist} {onOpenAlbum} {onOpenPlaylist} {onToggleTheme} {showLocalQueue} toggleLocalQueue={() => showLocalQueue = !showLocalQueue} />
      <button class="m-player-dismiss" aria-label="收起播放器" onclick={close} use:playerSurfaceGesture={{ controller, blocked: () => showLocalQueue }}><span></span></button>
    </div>
  </div>
{/if}

<style>
  .m-player-backdrop { display: none; }
  :global(html.mobile-runtime) .m-player-backdrop { display: block; position: absolute; inset: 0; background: rgb(0 0 0 / .45); }
</style>