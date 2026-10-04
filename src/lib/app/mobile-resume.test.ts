import assert from 'node:assert/strict'
import { clearInterruptedMobileTransitions } from './mobile-resume.ts'

function fakeElement(initial: string[]) {
  const classes = new Set(initial)
  return {
    classes,
    element: {
      classList: {
        remove: (...names: string[]) => names.forEach(name => classes.delete(name)),
      },
    },
  }
}

{
  const root = fakeElement(['mobile-runtime', 'layout-transitioning', 'accent-color-transitioning', 'keep-root'])
  const shell = fakeElement(['app-shell', 'theme-view-transitioning', 'theme-transitioning', 'keep-shell'])

  clearInterruptedMobileTransitions(root.element as Pick<Element, 'classList'>, shell.element as Pick<Element, 'classList'>)

  assert.deepEqual(
    [...root.classes].sort(),
    ['keep-root', 'mobile-runtime'],
    'resume cleanup must only remove transient root transition classes',
  )
  assert.deepEqual(
    [...shell.classes].sort(),
    ['app-shell', 'keep-shell'],
    'resume cleanup must only remove transient shell transition classes',
  )
}

{
  const root = fakeElement(['mobile-runtime'])
  assert.doesNotThrow(() => clearInterruptedMobileTransitions(root.element as Pick<Element, 'classList'>, null))
  assert.deepEqual([...root.classes], ['mobile-runtime'])
}

console.log('mobile resume transition cleanup tests passed')
