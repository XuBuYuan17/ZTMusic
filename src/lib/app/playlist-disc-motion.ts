export const PLAYLIST_DISC_SPIN_MS = 12_000
export const PLAYLIST_DISC_RESET_MS = 520
export const PLAYLIST_DISC_MORPH_MS = 760

export interface PlaylistDiscState {
  active: boolean
  playing: boolean
}

interface PlaylistDiscOptions {
  reduced?: boolean
  morphDelay?: number
}

export function playlistDiscAngle(currentTime: number, startAngle = 0): number {
  if (!Number.isFinite(currentTime) || currentTime <= 0) return ((startAngle % 360) + 360) % 360
  return ((startAngle + (currentTime % PLAYLIST_DISC_SPIN_MS) / PLAYLIST_DISC_SPIN_MS * 360) % 360 + 360) % 360
}

export function createPlaylistDiscMotion(node: HTMLElement, options: PlaylistDiscOptions = {}) {
  const reduced = options.reduced ?? (typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))
  const morphDelay = options.morphDelay ?? PLAYLIST_DISC_MORPH_MS
  let active = false
  let playing = false
  let spin: Animation | null = null
  let reset: Animation | null = null
  let spinStartAngle = 0
  let startTimer: ReturnType<typeof setTimeout> | null = null

  const setRotate = (angle: number) => node.style.setProperty('rotate', `${angle}deg`)
  const cancelStart = () => {
    if (startTimer == null) return
    clearTimeout(startTimer)
    startTimer = null
  }
  const cancelSpin = () => {
    spin?.cancel()
    spin = null
  }
  const cancelReset = () => {
    reset?.cancel()
    reset = null
  }

  const beginSpin = (delay = 0) => {
    cancelStart()
    cancelReset()
    if (reduced || !active || !playing) return
    const run = () => {
      startTimer = null
      if (!active || !playing || reduced) return
      spinStartAngle = 0
      setRotate(0)
      spin = node.animate([
        { rotate: '0deg' },
        { rotate: '360deg' },
      ], {
        duration: PLAYLIST_DISC_SPIN_MS,
        iterations: Infinity,
        easing: 'linear',
      })
    }
    if (delay > 0) startTimer = setTimeout(run, delay)
    else run()
  }

  const returnToZero = () => {
    cancelStart()
    if (reduced) {
      cancelSpin()
      cancelReset()
      setRotate(0)
      return
    }

    if (!spin) {
      if (!reset) setRotate(0)
      return
    }

    const angle = playlistDiscAngle(Number(spin.currentTime ?? 0), spinStartAngle)
    cancelSpin()
    if (angle < .01 || angle > 359.99) {
      setRotate(0)
      return
    }

    setRotate(angle)
    const animation = node.animate([
      { rotate: `${angle}deg` },
      { rotate: '360deg' },
    ], {
      duration: PLAYLIST_DISC_RESET_MS,
      easing: 'cubic-bezier(.2,0,0,1)',
      fill: 'both',
    })
    reset = animation
    animation.finished.catch(() => {}).then(() => {
      if (reset !== animation) return
      reset = null
      if (!playing) setRotate(0)
      animation.cancel()
    })
  }

  const update = (next: PlaylistDiscState) => {
    const wasPlaying = playing
    active = next.active
    playing = next.playing

    if (!active) {
      node.classList.remove('is-disc')
      cancelStart()
      cancelSpin()
      cancelReset()
      setRotate(0)
      return
    }

    if (reduced) {
      node.classList.toggle('is-disc', playing)
      cancelStart()
      cancelSpin()
      cancelReset()
      setRotate(0)
      return
    }

    if (playing) {
      node.classList.add('is-disc')
      if (spin || startTimer != null || wasPlaying) return
      cancelReset()
      setRotate(0)
      beginSpin(morphDelay)
      return
    }

    node.classList.remove('is-disc')
    if (wasPlaying) returnToZero()
    cancelStart()
    cancelSpin()
    if (!reset) setRotate(0)
  }

  return {
    update,
    destroy() {
      active = false
      playing = false
      node.classList.remove('is-disc')
      cancelStart()
      cancelSpin()
      cancelReset()
      node.style.removeProperty('rotate')
    },
  }
}

export function installPlaylistDiscMotion(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}

  let frame = 0
  let node: HTMLElement | null = null
  let motion: ReturnType<typeof createPlaylistDiscMotion> | null = null

  const sync = () => {
    frame = 0
    const mobile = document.documentElement.classList.contains('mobile-runtime')
    const page = mobile
      ? document.querySelector<HTMLElement>('.mobile-route-page:not([inert]) .playlist-detail-page')
      : null
    const nextNode = page?.querySelector<HTMLElement>('.playlist-track-table tr.active')
      ? page.querySelector<HTMLElement>('.playlist-cover-open')
      : null

    if (nextNode !== node) {
      motion?.destroy()
      node = nextNode
      motion = node ? createPlaylistDiscMotion(node) : null
    }

    motion?.update({
      active: Boolean(node),
      playing: Boolean(document.querySelector('.mobile-mini-player .mini-player-play.playing')),
    })
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'inert'],
  })
  document.addEventListener('visibilitychange', schedule)
  schedule()

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    document.removeEventListener('visibilitychange', schedule)
    motion?.destroy()
  }
}
