interface CollectionMotionOptions {
  stack: HTMLElement
  panel: HTMLElement
  backdrop: HTMLElement | null
  opening: boolean
  duration?: number
}

export function collectionCoverMotion({ stack, panel, backdrop, opening, duration = 440 }: CollectionMotionOptions) {
  const animations: Animation[] = []
  const clones: HTMLElement[] = []
  const hidden: Array<{ node: HTMLElement; visibility: string }> = []
  const body = panel.querySelector<HTMLElement>('.library-manager__body')
  const bounds = body?.getBoundingClientRect()
  const targets = new Map([...panel.querySelectorAll<HTMLElement>('[data-playlist-id]')].map(card => [
    card.dataset.playlistId,
    card.querySelector<HTMLElement>('.library-card-cover'),
  ]))
  let cleaned = false

  function hide(node: HTMLElement) {
    hidden.push({ node, visibility: node.style.visibility })
    node.style.visibility = 'hidden'
  }

  function cleanup() {
    if (cleaned) return
    cleaned = true
    animations.forEach(animation => animation.cancel())
    clones.forEach(clone => clone.remove())
    hidden.forEach(({ node, visibility }) => { node.style.visibility = visibility })
  }

  try {
    for (const [index, source] of [...stack.querySelectorAll<HTMLElement>('[data-stack-playlist-id]')].entries()) {
      const target = targets.get(source.dataset.stackPlaylistId)
      if (!target) continue
      const from = source.getBoundingClientRect()
      const to = target.getBoundingClientRect()
      const centerY = to.top + to.height / 2
      if (!source.offsetWidth || !source.offsetHeight || !to.width || !to.height || !bounds || centerY < Math.max(0, bounds.top) || centerY > Math.min(window.innerHeight, bounds.bottom)) continue

      const sourceTransform = getComputedStyle(source).transform
      const matrix = sourceTransform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(sourceTransform)
      const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
      const cosine = Math.abs(Math.cos(angle * Math.PI / 180))
      const sine = Math.abs(Math.sin(angle * Math.PI / 180))
      const width = source.offsetWidth * from.width / (source.offsetWidth * cosine + source.offsetHeight * sine)
      const height = source.offsetHeight * from.height / (source.offsetWidth * sine + source.offsetHeight * cosine)
      const transform = (rect: DOMRect, rotation: number, sx: number, sy: number) =>
        `translate3d(${rect.left + rect.width / 2 - width / 2}px, ${rect.top + rect.height / 2 - height / 2}px, 0) rotate(${rotation}deg) scale(${sx}, ${sy})`
      const stackFrame = { transform: transform(from, angle, 1, 1), borderRadius: getComputedStyle(source).borderRadius }
      const gridFrame = { transform: transform(to, 0, to.width / width, to.height / height), borderRadius: getComputedStyle(target).borderRadius }
      const clone = source.cloneNode(true) as HTMLElement
      clone.dataset.collectionFlight = source.dataset.stackPlaylistId
      clone.dataset.flightDirection = opening ? 'open' : 'close'
      clone.setAttribute('aria-hidden', 'true')
      Object.assign(clone.style, {
        position: 'fixed', left: '0', top: '0', width: `${width}px`, height: `${height}px`,
        margin: '0', zIndex: String(360 + index), visibility: 'visible', pointerEvents: 'none',
        transformOrigin: 'center', transition: 'none',
      })
      document.body.append(clone)
      clones.push(clone)
      hide(source)
      hide(target)
      animations.push(clone.animate(opening ? [stackFrame, gridFrame] : [gridFrame, stackFrame], {
        duration, easing: 'cubic-bezier(.22,.75,.2,1)', fill: 'both',
      }))
    }

    animations.push(panel.animate([{ opacity: opening ? 0 : 1 }, { opacity: opening ? 1 : 0 }], { duration, easing: 'ease-out', fill: 'both' }))
    if (backdrop) animations.push(backdrop.animate([{ opacity: opening ? 0 : 1 }, { opacity: opening ? 1 : 0 }], { duration, easing: 'ease-out', fill: 'both' }))
  } catch {
    cleanup()
  }

  return { finished: Promise.all(animations.map(animation => animation.finished.catch(() => {}))), cleanup }
}
