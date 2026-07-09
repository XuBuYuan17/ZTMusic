import { getSetting, setSetting } from './settings.js'

export const LAYOUT_MODE_KEY = 'layout_mode'

const PHONE_MAX_SHORT_SIDE = 600

export function getLayoutMode() {
  return getSetting(LAYOUT_MODE_KEY, 'auto')
}

export function setLayoutMode(value) {
  const mode = setSetting(LAYOUT_MODE_KEY, value)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('layout-mode-change', { detail: mode }))
  }
  return mode
}

export function isPhoneLayoutViewport(width, height) {
  const shortSide = Math.min(width || 0, height || 0)
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  return coarsePointer && shortSide > 0 && shortSide <= PHONE_MAX_SHORT_SIDE
}

export function shouldUseMobileLayout(width, height, mode = getLayoutMode()) {
  if (mode === 'mobile') return true
  if (mode === 'pc') return false
  return isPhoneLayoutViewport(width, height)
}