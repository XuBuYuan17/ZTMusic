/**
 * 社交预览自检：两端都要有数据与入口，且不能虚构「查看全部」这种不存在的列表页。
 * 跑法：node --experimental-strip-types src/lib/components/social-preview.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadSocialPreview } from '../services/user-profile.ts'

// ── 预览加载：只取关注/粉丝两路，失败收敛不抛 ──
const calls: string[] = []
const api = {
  userFollows: async (id: unknown, limit?: number) => {
    calls.push(`follows:${id}:${limit}`)
    return { follow: [{ userId: 1, nickname: 'A', avatarUrl: 'a.jpg' }, { id: 2, nickname: 'B' }] }
  },
  userFolloweds: async (id: unknown, limit?: number) => {
    calls.push(`followeds:${id}:${limit}`)
    return { followeds: [{ userId: 3, nickname: 'C' }] }
  },
}

const result = await loadSocialPreview(api, 42)
assert.deepEqual(calls, ['follows:42:8', 'followeds:42:8'], 'only the two preview requests, eight each')
assert.deepEqual(result.followsPreview.map(u => u.nickname), ['A', 'B'])
assert.deepEqual(result.followersPreview.map(u => u.userId), [3])
assert.equal(result.followsPreview[1]?.avatarUrl, '', 'missing avatar normalizes to empty string')

const failing = await loadSocialPreview({
  userFollows: async () => { throw new Error('offline') },
  userFolloweds: async () => { throw new Error('offline') },
}, 42)
assert.deepEqual(failing.followsPreview, [], 'a failed preview becomes empty, not a throw')
assert.deepEqual(failing.followersPreview, [])

// ── 组件：复用 SocialPreview，两端都在，不虚构列表功能 ──
const section = await readFile(new URL('./SocialPreviewSection.svelte', import.meta.url), 'utf8')
const social = await readFile(new URL('./SocialPreview.svelte', import.meta.url), 'utf8')
const home = await readFile(new URL('../pages/pc/Home.svelte', import.meta.url), 'utf8')
const library = await readFile(new URL('../pages/pc/Library.svelte', import.meta.url), 'utf8')
const user = await readFile(new URL('../pages/UserProfilePage.svelte', import.meta.url), 'utf8')

assert.ok(section.includes("import SocialPreview from './SocialPreview.svelte'"), 'reuses the existing component')
assert.equal((section.match(/<SocialPreview /g) ?? []).length, 2, 'exactly the two existing previews')
assert.ok(section.includes('onOpenUser'), 'user navigation is preserved')
assert.ok(home.includes('SocialPreviewSection') && user.includes('SocialPreviewSection'), 'profile views render social previews')
assert.ok(home.includes('followsPreview={profile.followsPreview}'), 'home passes the data it already loaded')
assert.ok(!library.includes('SocialPreviewSection') && !library.includes('library-profile-link'), 'own social profile is not linked from the library')

// 只展示预览，不假装有完整列表
for (const invented of ['查看全部', '加载更多', 'onMore', 'onSeeAll', 'loadMore']) {
  assert.ok(!section.includes(invented), `must not invent a full list entry (${invented})`)
}
assert.ok(!social.includes('查看全部'), 'the preview card itself stays a preview')

// 窄屏堆叠：媒体查询 + 移动端都不再并排
assert.ok(section.includes('@media (max-width: 900px)'), 'narrow window stacks the pair')
assert.ok(section.includes('grid-template-columns: minmax(0, 1fr)'), 'stacked column')
assert.ok(section.includes(':global(html.mobile-runtime)'), 'mobile runtime also stacks')

console.log('social preview: data, entry and honest limits passed')
