import { lerp } from '../app/morph-geometry.ts'

export interface SurfaceRect { left: number; top: number; width: number; height: number }
export const clampProgress = (value: number) => Math.max(0, Math.min(1, value))

export function surfaceFrame(progress: number, source: SurfaceRect, viewport: { width: number; height: number }) {
  const p = clampProgress(progress)
  return {
    clipPath: `inset(${Math.max(0, source.top) * (1 - p)}px ${Math.max(0, viewport.width - source.left - source.width) * (1 - p)}px ${Math.max(0, viewport.height - source.top - source.height) * (1 - p)}px ${Math.max(0, source.left) * (1 - p)}px round 0px)`,
    navTransform: `translateY(${p * 100}%)`,
    backdropOpacity: p,
    backgroundOpacity: clampProgress(p / .16),
    miniOpacity: 1 - clampProgress(p / .18),
    contentOpacity: p,
  }
}

export function coverFrame(progress: number, source: SurfaceRect, target: SurfaceRect) {
  const p = clampProgress(progress)
  const side = lerp(source.width, target.width, p)
  return {
    left: lerp(source.left, target.left, p),
    top: lerp(source.top, target.top, p),
    side,
    scale: target.width > 0 ? side / target.width : 1,
  }
}
