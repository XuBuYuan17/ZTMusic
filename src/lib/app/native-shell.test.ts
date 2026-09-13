/**
 * native-shell 自检：验证守卫的按键屏蔽与环境门控逻辑。
 * 运行：node src/lib/app/native-shell.test.ts
 */
import assert from 'node:assert'

// 构造最小 DOM/window 桩，让模块在 node 下可加载
const listeners: Record<string, Array<(e: unknown) => void>> = { keydown: [], contextmenu: [] }
const classes = new Set<string>()

type TauriWindow = Window & typeof globalThis & { __TAURI_INTERNALS__?: unknown }

globalThis.window = {
  __TAURI_INTERNALS__: {}, // 模拟原生外壳
  addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type]?.push(fn) },
  removeEventListener: (type: string, fn: (e: unknown) => void) => {
    const arr = listeners[type]
    if (arr) listeners[type] = arr.filter((f) => f !== fn)
  },
} as unknown as TauriWindow
globalThis.document = {
  documentElement: {
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
  },
} as unknown as Document

const { installNativeShell, isNativeShell } = await import('./native-shell.ts')

assert.equal(isNativeShell(), true, '有 __TAURI_INTERNALS__ 时应识别为原生外壳')

const uninstall = installNativeShell()
assert.ok(classes.has('native-shell'), '安装后应打上 native-shell 类')

// 模拟一个 keydown，检查 preventDefault 是否被调用
function fireKey(init: Record<string, unknown>): boolean {
  let prevented = false
  const evt = { preventDefault: () => (prevented = true), ...init }
  listeners.keydown!.forEach((fn) => fn(evt))
  return prevented
}

assert.ok(fireKey({ key: 'F5', ctrlKey: false, metaKey: false }), 'F5 应被屏蔽')
assert.ok(fireKey({ key: 'r', ctrlKey: true }), 'Ctrl+R 应被屏蔽')
assert.ok(fireKey({ key: 'f', metaKey: true }), 'Cmd+F 应被屏蔽')
assert.ok(fireKey({ key: '=', ctrlKey: true }), 'Ctrl+= 应被屏蔽')
assert.ok(!fireKey({ key: 'a', ctrlKey: true }), 'Ctrl+A（全选）不应被屏蔽')
assert.ok(!fireKey({ key: 's', ctrlKey: true }), 'Ctrl+S 不应被屏蔽')

// contextmenu 应被阻止
let ctxPrevented = false
listeners.contextmenu!.forEach((fn) => fn({ preventDefault: () => (ctxPrevented = true) }))
assert.ok(ctxPrevented, '空白右键菜单应被屏蔽')

uninstall()
assert.ok(!classes.has('native-shell'), '卸载后应移除 native-shell 类')

// 非原生环境应空转
const win = window as TauriWindow
delete win.__TAURI_INTERNALS__
assert.equal(isNativeShell(), false, '无 __TAURI_INTERNALS__ 时不是原生外壳')

console.log('native-shell 自检通过')
