/**
 * 精选内容模块自检：两端同一动作、图片失败不塌陷、横滑不误触返回。
 * 跑法：node src/lib/components/featured-content.test.js
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const module = await readFile(new URL('./FeaturedContent.svelte', import.meta.url), 'utf8')
const explore = await readFile(new URL('../pages/pc/Explore.svelte', import.meta.url), 'utf8')
const mobileCss = await readFile(new URL('../../app-mobile.css', import.meta.url), 'utf8')

// ── 1) 两端是同一模块的两种布局，只有一个动作出口 ──
assert.equal((explore.match(/<FeaturedContent/g) ?? []).length, 1, 'one shared featured module')
assert.ok(explore.includes("layout={mobile ? 'rail' : 'hero'}"), 'the narrow layout is a module variant')
assert.ok(!explore.includes('mobile-feature-item'), 'narrow markup moved into the module')
assert.ok(!explore.includes('music-feature-card'), 'wide markup moved into the module')
assert.equal((module.match(/onSelect\?\.\(/g) ?? []).length >= 3, true, 'every card emits the same action')
assert.ok(module.includes("onclick={() => onSelect?.(hero)}"), 'hero card uses the shared action')
assert.ok(module.includes("onclick={() => onSelect?.(banner)}"), 'rail card uses the shared action')
assert.ok(module.includes("onclick={() => onSelect?.(item)}"), 'editorial card uses the shared action')

// 两端传的是同一个回调
assert.equal((explore.match(/onSelect=\{\(item\) => onBannerClick\?\.\(item\)\}/g) ?? []).length, 1, 'both layouts funnel into onBannerClick')

// ── 2) 图片失败不塌陷：只隐藏图片，不删元素，容器比例固定 ──
assert.ok(module.includes('function hideBrokenImage'), 'broken images are handled')
assert.ok(module.includes("style.visibility = 'hidden'"), 'the image keeps its box instead of collapsing')
assert.ok(!module.includes("setAttribute('hidden'"), 'no element removal on error')
for (const img of ['900, 600', '1200, 680', '520, 300']) {
  assert.ok(module.includes(img), `cover is requested with a fixed ratio ${img}`)
}
const exploreCss = await readFile(new URL('../../styles/explore.css', import.meta.url), 'utf8')
assert.ok(/\.music-feature-card\.primary \{[^}]*min-height: 326px/.test(exploreCss), 'the hero card keeps a fixed height')
assert.ok(module.includes('aspect-ratio: 16 / 9'), 'the narrow hero keeps a fixed ratio')
assert.ok(/\.music-feature-card img \{[^}]*object-fit: cover/.test(exploreCss), 'images cover their box')

// ── 3) 横滑不误触返回 ──
assert.ok(module.includes('touch-action: pan-x'), 'the rail only takes horizontal gestures')
assert.ok(module.includes('overscroll-behavior-x: contain'), 'the rail does not chain scroll to the page')
assert.ok(/\.mobile-feature-image \{[^}]*aspect-ratio: 3 \/ 2/.test(mobileCss), 'the narrow cover keeps a fixed ratio')
assert.ok(mobileCss.includes('overscroll-behavior-x: contain'), 'global rail rule still contains horizontal overscroll')

// ── 4) 数据仍由页面持有，模块不自己拉 ──
assert.ok(!module.includes('ncm.'), 'the module does not fetch')
assert.ok(!module.includes('loadExploreData'), 'the module does not load explore data')
assert.ok(explore.includes('banners={mobile ? exploreBanners : featuredBanners}'), 'the page passes the data in (full rail vs hero+editorials)')

console.log('featured content: shared action, stable images and safe rails passed')
