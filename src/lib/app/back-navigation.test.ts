/**
 * 统一返回规则自检：弹层优先、其次浮层、最后页面历史。
 * 跑法：node --experimental-strip-types src/lib/app/back-navigation.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { configureBackNavigation, registerBackLayers, requestBack } from './back-navigation.ts'

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8')

// ── 1) 顺序：弹层 → 抽屉 → 面板 → 队列 → 页面历史 ──
{
  const calls: string[] = []
  configureBackNavigation({ dismissDialog: () => { calls.push('dialog'); return true }, popPage: () => { calls.push('page') } })
  registerBackLayers({
    drawer: () => { calls.push('drawer'); return true },
    sheet: () => { calls.push('sheet'); return true },
    queue: () => { calls.push('queue'); return true },
  })
  assert.equal(requestBack(), true)
  assert.deepEqual(calls, ['dialog'], 'an open dialog consumes the back press')
}

{
  const calls: string[] = []
  configureBackNavigation({ dismissDialog: () => false, popPage: () => { calls.push('page') } })
  registerBackLayers({
    drawer: () => { calls.push('drawer'); return true },
    sheet: () => { calls.push('sheet'); return true },
    queue: () => { calls.push('queue'); return true },
  })
  requestBack()
  assert.deepEqual(calls, ['drawer'], 'the drawer comes next')
}

{
  const calls: string[] = []
  configureBackNavigation({ dismissDialog: () => false, popPage: () => { calls.push('page') } })
  registerBackLayers({
    drawer: () => false,
    sheet: () => { calls.push('sheet'); return true },
    queue: () => { calls.push('queue'); return true },
  })
  requestBack()
  assert.deepEqual(calls, ['sheet'], 'then the sheet')
}

{
  const calls: string[] = []
  configureBackNavigation({ dismissDialog: () => false, popPage: () => { calls.push('page') } })
  registerBackLayers({ drawer: () => false, sheet: () => false, queue: () => { calls.push('queue'); return true } })
  requestBack()
  assert.deepEqual(calls, ['queue'], 'then the queue panel')
}

{
  const calls: string[] = []
  configureBackNavigation({ dismissDialog: () => false, popPage: () => { calls.push('page') } })
  registerBackLayers({ drawer: () => false, sheet: () => false, queue: () => false })
  assert.equal(requestBack(), true)
  assert.deepEqual(calls, ['page'], 'with nothing on top, only one page step happens')
}

// ── 2) 一次返回只前进一步，不会重复弹栈 ──
{
  let popped = 0
  configureBackNavigation({ dismissDialog: () => false, popPage: () => { popped++ } })
  registerBackLayers({ drawer: () => false, sheet: () => false, queue: () => false })
  requestBack()
  assert.equal(popped, 1, 'exactly one level per back press')
}

// ── 3) 某一层抛错不会让返回彻底失效 ──
{
  let popped = 0
  configureBackNavigation({ dismissDialog: () => { throw new Error('boom') }, popPage: () => { popped++ } })
  registerBackLayers({ drawer: () => false, sheet: () => false, queue: () => false })
  const handled = requestBack()
  assert.equal(handled, false, 'a throwing layer is reported, not swallowed silently')
  assert.equal(popped, 0, 'and it does not fall through into navigation')
}

// ── 4) 四个入口都接的是同一个函数 ──
const app = await read('../../App.svelte')
const host = await read('../components/layout/DesktopPageHost.svelte')
const mobile = await read('../components/MobileApp.svelte')

assert.ok(app.includes("import { configureBackNavigation, registerBackLayers, requestBack }"), 'app wires the shared entry')
assert.ok(app.includes('subscribeAndroidBack(() => { requestBack() })'), 'android back uses it')
assert.ok(app.includes("if (event.key !== 'Escape'"), 'escape uses it')
assert.ok(app.includes('configureBackNavigation({ dismissDialog: dismissTopDialog, popPage: () => router.goBack() })'), 'dialog + page history are injected')
assert.ok(app.includes('onBack={() => { requestBack() }}'), 'the shell back passes through it')
assert.ok(host.includes('onBack={goBackFromPage}'), 'page back buttons go through it')
assert.ok(host.includes('function goBackFromPage(): void { requestBack() }'), 'and the desktop content back has one implementation')
assert.ok(mobile.includes('activeChrome?.back ?? onBack'), 'mobile prefers page chrome, then the shell back')

// ── 5) 设置子页的「回到分类首页」规则仍在 ──
const router = await read('../stores/router.svelte.ts')
assert.ok(router.includes("view.startsWith('settings-')"), 'settings subpages still push their source')
assert.ok(router.includes('if (prev.view ===') , 'goBack still restores the previous view from the stack')

// ── 6) 根视图不订阅返回键：交给系统退出 ──
assert.ok(app.includes("const atRoot = router.activeView === 'explore' || router.activeView === 'library'"), 'root is judged by navigation, not window width')
assert.ok(app.includes('if (!hasBackTarget) return'), 'no subscription when there is nothing to go back to')

console.log('back navigation: dialogs first, single step, four entries and settings rule passed')
