/**
 * 发现页生命周期自检：初载/缓存/后台刷新/失败四态，账号隔离与单模板。
 * 跑法：node src/lib/pages/explore-lifecycle.test.js
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = file => readFile(new URL(file, import.meta.url), 'utf8')
const source = await read('./pc/Explore.svelte')
const module = await read('../components/NewSongsModule.svelte')

// ── 1) 四态显式 ──
assert.ok(source.includes("const phase = $derived.by("), 'the page has an explicit phase')
for (const state of ["'initial'", "'cached'", "'refreshing'", "'failed'", "'stale'"]) {
  assert.ok(source.includes(state), `phase includes ${state}`)
}
assert.ok(source.includes('const hasContent = $derived('), 'phase depends on whether anything is loaded')

// 无内容 + 报错 = 整页错误；有内容 + 报错 = 降级提示
assert.ok(source.includes("{#if phase === 'failed'}") && source.includes("<ErrorBlock message={error}"), 'a hard failure only shows when there is nothing to show')
assert.ok(source.includes("{:else if phase === 'stale'}"), 'a refresh failure with content degrades to a notice')
assert.ok(source.includes('刷新失败，先显示上次的内容'), 'the notice explains what the user is looking at')
assert.ok(source.includes('onRetry={() => loadExplore(true)}'), 'both states can retry')

// ── 2) 缓存与有效期沿用 ──
assert.ok(source.includes('exploreSnapshot') && source.includes('exploreSnapshotAt') && source.includes('SNAPSHOT_TTL'), 'the snapshot cache and its TTL are kept')
assert.ok(source.includes('exploreSnapshotOwner === initialOwner'), 'the cached page is only reused for the same account')
assert.ok(source.includes('const initialExplore ='), 'the first render can use the cache immediately')
assert.ok(source.includes('let exploreLoading = $state(!initialExplore)'), 'loading starts false when a cache is available')

// ── 3) 失败保留已有内容 ──
const catchBlock = source.slice(source.indexOf('} catch (e) { if (rid === requestId)'), source.indexOf('} catch (e) { if (rid === requestId)') + 160)
assert.ok(!/exploreBanners = \[\]/.test(catchBlock), 'a failed refresh must not clear the content')
assert.ok(catchBlock.includes('error = errorMessage(e)'), 'a failed refresh records an error')

// ── 4) 账号切换不混用 ──
assert.ok(source.includes('if (exploreSnapshotOwner !== owner) {'), 'a different account clears the previous lists')
assert.ok(source.includes('owner !== (auth.isLoggedIn && auth.cookieOk ? auth.user : null)'), 'a late response from the previous account is dropped')
assert.ok(source.includes('if (rid !== requestId'), 'a superseded request is dropped')

// ── 5) 页面活跃状态处理保留 ──
assert.ok(source.includes('if (active) untrack(() => { void loadExplore()'), 'returning to the page reloads it')
assert.ok(source.includes('auth.user; auth.cookieOk; auth.isLoggedIn'), 'auth changes retrigger the load')

// ── 6) 两端一份模板 ──
assert.ok(!/^\{#if mobile\}$/m.test(source), 'no page-level layout branch')
assert.equal((source.match(/<NewSongsModule/g) ?? []).length, 1, 'modules are rendered once')
assert.ok(module.includes('{#if mobile}'), 'the module owns its own layout switch')

console.log('explore lifecycle: phase, cache, failure, account switch and single template passed')
