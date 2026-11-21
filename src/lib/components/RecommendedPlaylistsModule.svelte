<script lang="ts">
  import PreviewCard from './PreviewCard.svelte'
  import MobileCoverRows from './MobileCoverRows.svelte'

  // 推荐歌单预览（主列表与次级列表共用一个模块），数据与动作都由页面给。
  interface PlaylistItem {
    id?: unknown
    name?: unknown
    picUrl?: unknown
    copywriter?: unknown
    trackCount?: unknown
  }

  let {
    playlists = [],
    loading = false,
    mobile = false,
    limit = 14,
    title = '推荐歌单',
    label = '推荐歌单',
    onOpenPlaylist,
  }: {
    playlists?: PlaylistItem[]
    loading?: boolean
    mobile?: boolean
    limit?: number
    title?: string
    /** 无障碍用的分区名，移动端与桌面端共用 */
    label?: string
    onOpenPlaylist?: (playlist: PlaylistItem) => void
  } = $props()

  let expanded = $state(false)
  const visible = $derived(mobile || expanded ? playlists : playlists.slice(0, limit))
  const truncated = $derived(playlists.length > limit)

  function metaOf(playlist: PlaylistItem): string {
    const copywriter = String(playlist.copywriter ?? '')
    if (copywriter && (!mobile || copywriter !== '歌单')) return copywriter
    const count = Number(playlist.trackCount ?? 0)
    return count > 0 ? `${count} 首歌曲` : mobile ? '' : '歌单'
  }
</script>

{#if loading || playlists.length}
{#if mobile}
  <section class="mobile-discovery-section" aria-label={label}>
    <h2>{title}</h2>
    <MobileCoverRows items={visible} loading={loading && !playlists.length}>
      {#snippet children(playlist)}
        <PreviewCard mobile title={String(playlist.name ?? '')} meta={metaOf(playlist)} cover={String(playlist.picUrl ?? '')} onSelect={() => onOpenPlaylist?.(playlist)} />
      {/snippet}
    </MobileCoverRows>
  </section>
{:else}
  <section class="music-discovery-section">
    <div class="music-section-head">
      <h2>{title}</h2>
      {#if truncated}<button class="music-preview-more" type="button" aria-expanded={expanded} onclick={() => expanded = !expanded}>{expanded ? '收起' : `展开全部 ${playlists.length} 个`}</button>{/if}
    </div>
    <div class="music-card-rail">
      {#if loading && !playlists.length}
        {#each Array(8) as _, index (index)}
          <div class="music-cover-card skeleton-row">
            <span class="music-cover-placeholder skeleton-block"></span>
            <strong class="skeleton-line"></strong>
            <em class="skeleton-line narrow"></em>
          </div>
        {/each}
      {:else}
        {#each visible as playlist (playlist.id)}
          <PreviewCard title={String(playlist.name ?? '')} meta={metaOf(playlist)} cover={String(playlist.picUrl ?? '')} onSelect={() => onOpenPlaylist?.(playlist)} />
        {/each}
      {/if}
    </div>
  </section>
{/if}
{/if}
