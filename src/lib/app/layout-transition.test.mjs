// 横竖屏切换过渡的判定自检。只测纯函数，不碰 DOM / View Transition。
import assert from 'node:assert/strict'
import { orientationFlipped, shouldAnimateLayoutFlip } from './layout-transition.ts'

// 手机竖屏 → 横屏
const rotate = { wasMobile: true, isMobile: false, prevWidth: 390, prevHeight: 844, width: 844, height: 390, touch: true }

assert.equal(shouldAnimateLayoutFlip(rotate), true, 'touch rotation animates')
assert.equal(shouldAnimateLayoutFlip({ ...rotate, touch: false }), false, 'desktop window resize must not animate')
assert.equal(shouldAnimateLayoutFlip({ ...rotate, wasMobile: false, isMobile: false }), false, 'no shell change, no animation')
assert.equal(shouldAnimateLayoutFlip({ ...rotate, width: 0, height: 0 }), false, 'unknown new size, no animation')
assert.equal(shouldAnimateLayoutFlip({ ...rotate, prevWidth: 0, prevHeight: 0 }), false, 'unknown previous size, no animation')

// 竖屏内改宽度不算翻转
assert.equal(shouldAnimateLayoutFlip({ ...rotate, width: 320, height: 700 }), false, 'portrait resize keeps portrait')
// 横屏内改宽度不算翻转
assert.equal(shouldAnimateLayoutFlip({ ...rotate, prevWidth: 844, prevHeight: 390, width: 740, height: 360 }), false, 'landscape resize keeps landscape')

// 反向：横屏 → 竖屏
assert.equal(shouldAnimateLayoutFlip({ wasMobile: false, isMobile: true, prevWidth: 844, prevHeight: 390, width: 390, height: 844, touch: true }), true, 'landscape to portrait animates')

assert.equal(orientationFlipped(844, 390, 390, 844), true, 'landscape to portrait flips')
assert.equal(orientationFlipped(390, 844, 320, 700), false, 'same orientation does not flip')

console.log('layout transition self-check: passed')
