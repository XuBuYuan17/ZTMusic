<script lang="ts" generics="T extends { id?: unknown; title?: unknown; pic?: unknown }">
  import { coverRectUrl } from '../utils/image.ts'
  import Icon from './ui/Icon.svelte'

  // 精选内容：banner / 编辑精选。数据与点击动作都由外面给，
  // 宽屏是「重点卡 + 编辑精选栏」，窄屏是横滑列表——同一份数据、同一个动作。
  let {
    banners = [],
    editorials = [],
    loading = false,
    layout = 'hero',
    onSelect,
  }: {
    banners?: T[]
    editorials?: T[]
    loading?: boolean
    layout?: 'hero' | 'rail'
    onSelect?: (item: T) => void
  } = $props()

  // 图片失败时保留占位尺寸，只把图片隐掉：塌陷会让整块布局跳动
  function hideBrokenImage(event: Event): void {
    const image = event.currentTarget
    if (image instanceof HTMLElement) image.style.visibility = 'hidden'
  }
</script>

{#if layout === 'rail'}
  <section class="mobile-feature-rail" aria-label="精选推荐">
    {#if loading && !banners.length}
      {#each Array(2) as _, index (index)}<div class="mobile-feature-item"><span class="skeleton-line"></span><span class="mobile-feature-image skeleton-block"></span></div>{/each}
    {:else}
      {#each banners as banner, index (`${String(banner.id)}:${index}`)}
        <button class="mobile-feature-item" type="button" onclick={() => onSelect?.(banner)}>
          <small>精选推荐</small><strong>{String(banner.title ?? '') || '今日推荐'}</strong>
          <span class="mobile-feature-image">{#if banner.pic}<img src={coverRectUrl(String(banner.pic), 900, 600)} alt="" onerror={hideBrokenImage} referrerpolicy="no-referrer" loading={index ? 'lazy' : 'eager'} />{:else}<Icon name="music" size={44} />{/if}</span>
        </button>
      {/each}
    {/if}
  </section>
{:else}
  <section class="music-discovery-feature">
    {#if loading && !banners.length}
      <div class="music-feature-card primary skeleton-block" aria-label="加载精选内容"></div>
    {:else if banners.length}
      {@const hero = banners[0]!}
      <button class="music-feature-card primary" data-motion="card" onclick={() => onSelect?.(hero)}>
        {#if hero.pic}<img src={coverRectUrl(String(hero.pic), 1200, 680)} alt={String(hero.title ?? '')} loading="lazy" referrerpolicy="no-referrer" onerror={hideBrokenImage} />{/if}
        <span class="music-feature-copy">
          <small>编辑精选 · 今日置顶</small>
          <strong>{String(hero.title ?? '') || '今日推荐'}</strong>
          <em>从这里开始今天的播放</em>
        </span>
      </button>
    {/if}

    {#if loading && editorials.length === 0}
      <div class="music-feature-stack" aria-label="加载推荐内容">
        {#each Array(3) as _, index (index)}
          <div class="music-feature-card compact skeleton-block"></div>
        {/each}
      </div>
    {:else if editorials.length > 0}
      <div class="music-feature-stack">
        {#each editorials as item (item.id)}
          <button class="music-feature-card compact" data-motion="card" onclick={() => onSelect?.(item)}>
            {#if item.pic}<img src={coverRectUrl(String(item.pic), 520, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={hideBrokenImage} />{/if}
            <span class="music-feature-copy">
              <small>推荐 · 更新中</small>
              <strong>{String(item.title ?? '') || '编辑推荐'}</strong>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  /* 横滑只吃横向手势：不把滚动传给页面，避免边缘滑动触发返回/回弹 */
  .mobile-feature-rail { touch-action: pan-x; overscroll-behavior-x: contain; }

  /* 窄屏（mobile-runtime）下的重点卡收敛：大图铺满、隐藏编辑精选栏 */
  :global(html.mobile-runtime .music-discovery-feature) { order: 1; display: block; margin: 0; }
  :global(html.mobile-runtime .music-feature-stack),
  :global(html.mobile-runtime .music-feature-copy small),
  :global(html.mobile-runtime .music-feature-copy em) { display: none; }
  :global(html.mobile-runtime .music-discovery .music-feature-card.primary) { display: block; width: 100%; min-height: 0; aspect-ratio: 16 / 9; border: 0; border-radius: var(--radius-sm); box-shadow: none; }
  :global(html.mobile-runtime .music-discovery .music-feature-copy strong) { font-size: 22px; }
</style>
