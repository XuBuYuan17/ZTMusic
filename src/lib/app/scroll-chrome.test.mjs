// 滑动隐藏底部 chrome 的状态机自检。只测纯逻辑，不碰 DOM / 滚动容器。
import assert from 'node:assert/strict'
import { createScrollChrome } from './scroll-chrome.ts'

// delay = 0 + 一个 macrotask 就能驱动恢复定时器，不需要 fake timer
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const spy = () => {
  const calls = []
  return { calls, apply: (hidden) => calls.push(hidden) }
}

// 触摸滑动期间隐藏，且只隐藏一次（去重，不能每个 scroll 事件都写 DOM）
{
  const s = spy()
  const chrome = createScrollChrome(s.apply, 0)
  chrome.interact(true)
  chrome.scroll(100)
  chrome.scroll(200)
  chrome.scroll(300)
  assert.deepEqual(s.calls, [true], '滑动期间只隐藏一次')
  await tick()
  assert.deepEqual(s.calls, [true, false], '停手后恢复')
  chrome.destroy()
}

// 顶部保护：在顶部滑动不隐藏
{
  const s = spy()
  const chrome = createScrollChrome(s.apply, 0)
  chrome.interact(true)
  chrome.scroll(0)
  assert.deepEqual(s.calls, [], '在顶部不隐藏')
  await tick()
  assert.deepEqual(s.calls, [], '顶部不隐藏也就没有恢复动作')
  chrome.destroy()
}

// 程序化滚动（返回上一页的位置恢复 / 点当前标签的平滑滚动）不触发隐藏
{
  const s = spy()
  const chrome = createScrollChrome(s.apply, 0)
  chrome.interact(false)
  chrome.scroll(400)
  assert.deepEqual(s.calls, [], '非用户滚动不隐藏')
  chrome.destroy()
}

// 隐藏中滚回顶部：立即恢复，不等 delay
{
  const s = spy()
  const chrome = createScrollChrome(s.apply, 0)
  chrome.interact(true)
  chrome.scroll(300)
  assert.deepEqual(s.calls, [true])
  chrome.scroll(0)
  assert.deepEqual(s.calls, [true, false], '滚回顶部立即恢复')
  chrome.destroy()
}

// 惯性滚动：touchend 之后仍持续派发 scroll，恢复定时器被不断重置
{
  const s = spy()
  const chrome = createScrollChrome(s.apply, 10)
  chrome.interact(true)
  chrome.scroll(300)
  chrome.interact(false)          // 手指离开
  chrome.scroll(500)              // 惯性仍在滚
  await tick()
  assert.deepEqual(s.calls, [true], '惯性期间不恢复')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(s.calls, [true, false], '停稳后恢复')
  chrome.destroy()
}

// destroy：立即恢复，且残留定时器不再触发
{
  const s = spy()
  const chrome = createScrollChrome(s.apply, 0)
  chrome.interact(true)
  chrome.scroll(300)
  chrome.destroy()
  assert.deepEqual(s.calls, [true, false], 'destroy 立即恢复')
  await tick()
  assert.deepEqual(s.calls, [true, false], 'destroy 后不再有回调')
}

console.log('scroll chrome self-check: hide, restore and interaction gating passed')
