<script lang="ts">
  import { dialogFocus } from '../app/desktop-motion.ts'
  import { mobileDrag } from '../app/mobile-interaction.ts'
  import AppleMusicPlayer from './AppleMusicPlayer.svelte'

  interface LyricsOrigin { x?: number; y?: number; top?: number; right?: number; bottom?: number; left?: number; radius?: number }
  let { show = false, origin = null, onClose, onOpenArtist, onOpenAlbum, onOpenPlaylist, onToggleTheme }: {
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

  function coverFrames(cover: HTMLElement, destination: { left: number; top: number; width: number; height: number }) {
    const rect = cover.getBoundingClientRect()
    return { transform: `translate(${destination.left - rect.left}px, ${destination.top - rect.top}px) scale(${destination.width / rect.width}, ${destination.height / rect.height})`, borderRadius: '12px' }
  }

  function enter(node: HTMLElement) {
    closing = false
    showLocalQueue = false
    const frame = requestAnimationFrame(() => {
      if (reduced()) return
      const cover = node.querySelector<HTMLElement>('.am-flying-cover')
      animate(node,[{ opacity: 0 }, { opacity: 1 }], { duration: 220 })
      if (cover && origin?.left != null && origin.top != null) {
        animate(cover,[coverFrames(cover, { left: origin.left, top: origin.top, width: window.innerWidth - origin.left - (origin.right ?? 0), height: window.innerHeight - origin.top - (origin.bottom ?? 0) }), { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' })
      } else animate(node,[{ translate: '0 100%' }, { translate: '0 0' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' })
    })
    return { destroy() { cancelAnimationFrame(frame); cancelAnimations() } }
  }

  function close() {
    if (closing) return
    closing = true
    showLocalQueue = false
    cancelAnimations()
    const cover = root?.querySelector<HTMLElement>('.am-flying-cover')
    const mini = document.querySelector<HTMLElement>('.lcd-artwork__img')
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
  <div class="ly-fullscreen mounted entered" class:closing bind:this={root} use:enter use:dialogFocus={close} role="dialog" aria-modal="true" aria-label="正在播放" tabindex="-1">
    <div class="ly-container">
      <AppleMusicPlayer onClose={close} {onOpenArtist} {onOpenAlbum} {onOpenPlaylist} {onToggleTheme} {showLocalQueue} toggleLocalQueue={() => showLocalQueue = !showLocalQueue} />
      <button class="m-player-dismiss" aria-label="收起播放器" onclick={close} use:mobileDrag={{ close, target: () => root, blocked: () => showLocalQueue }}><span></span></button>
    </div>
  </div>
{/if}
