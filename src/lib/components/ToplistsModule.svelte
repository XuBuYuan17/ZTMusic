<script lang="ts">
  import PreviewCard from './PreviewCard.svelte'

  // 榜单：沿用页面的 toplists 数据与缓存，失败只在本模块内提示。
  interface ChartItem {
    id?: unknown
    name?: unknown
    coverImgUrl?: unknown
    updateFrequency?: unknown
  }

  let {
    toplists = [],
    loading = false,
    error = '',
    mobile = false,
    limit = 12,
    title = '排行榜',
    onOpenPlaylist,
    onRetry,
  }: {
    toplists?: ChartItem[]
    loading?: boolean
    error?: string
    mobile?: boolean
    limit?: number
    title?: string
    onOpenPlaylist?: (chart: ChartItem) => void
    onRetry?: () => void
  } = $props()

  let expanded = $state(false)
  const visible = $derived(expanded ? toplists : toplists.slice(0, limit))
  const truncated = $derived(toplists.length > limit)
  const failed = $derived(Boolean(error) && !toplists.length)
</script>

{#if loading || toplists.length || error}
  {#if mobile}
    <section class="mobile-discovery-section" aria-label="榜单">
      <h2>{title}</h2>
      {#if failed}
        <div class="toplist-state" role="status">
          <p>榜单加载失败</p>
          {#if onRetry}<button type="button" onclick={() => onRetry?.()}>重试</button>{/if}
        </div>
      {:else}
        <div class="mobile-cover-rail">
          {#if loading && !toplists.length}
            {#each Array(4) as _, index (index)}<div class="mobile-cover-item"><span class="mobile-cover-image skeleton-block"></span><span class="skeleton-line"></span></div>{/each}
          {:else}
            {#each visible as chart (chart.id)}
              <PreviewCard mobile title={String(chart.name ?? '')} meta={String(chart.updateFrequency ?? '') || '持续更新'} cover={String(chart.coverImgUrl ?? '')} onSelect={() => onOpenPlaylist?.(chart)} />
            {/each}
          {/if}
        </div>
        {#if truncated}<button class="music-preview-more" type="button" aria-expanded={expanded} onclick={() => expanded = !expanded}>{expanded ? '收起' : `展开全部 ${toplists.length} 个`}</button>{/if}
      {/if}
    </section>
  {:else}
    <section class="music-discovery-section music-toplist-panel">
      <div class="music-section-head">
        <h2>{title}</h2>
        {#if truncated}<button class="music-preview-more" type="button" aria-expanded={expanded} onclick={() => expanded = !expanded}>{expanded ? '收起' : `展开全部 ${toplists.length} 个`}</button>{/if}
      </div>
      {#if failed}
        <div class="toplist-state" role="status">
          <p>榜单加载失败</p>
          {#if onRetry}<button type="button" onclick={() => onRetry?.()}>重试</button>{/if}
        </div>
      {:else}
        <div class="music-card-rail music-chart-rail">
          {#if loading && !toplists.length}
            {#each Array(8) as _, index (index)}
              <div class="music-cover-card skeleton-row">
                <span class="music-cover-placeholder skeleton-block"></span>
                <strong class="skeleton-line"></strong>
                <em class="skeleton-line narrow"></em>
              </div>
            {/each}
          {:else}
            {#each visible as chart (chart.id)}
              <PreviewCard title={String(chart.name ?? '')} meta={String(chart.updateFrequency ?? '') || '持续更新'} cover={String(chart.coverImgUrl ?? '')} onSelect={() => onOpenPlaylist?.(chart)} />
            {/each}
          {/if}
        </div>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .toplist-state { min-height: 96px; display: grid; place-items: center; gap: 10px; color: var(--text-tertiary); font-size: 12px; }
  .toplist-state p { margin: 0; }
  .toplist-state button { min-height: 32px; padding: 0 14px; border-radius: var(--radius-lg); background: var(--accent-bg); color: var(--accent); font-size: 12px; font-weight: 700; }
  .toplist-state button:hover { background: var(--accent-bg-hover); }
</style>
