<script lang="ts">
  import PreviewCard from './PreviewCard.svelte'

  // 新专辑预览：只接收数据与动作，不自己请求。
  interface AlbumItem {
    id?: unknown
    name?: unknown
    picUrl?: unknown
    artistName?: unknown
  }

  let {
    albums = [],
    loading = false,
    mobile = false,
    limit = 10,
    title = '本周新发行',
    onOpenAlbum,
  }: {
    albums?: AlbumItem[]
    loading?: boolean
    mobile?: boolean
    limit?: number
    title?: string
    onOpenAlbum?: (id: unknown) => void
  } = $props()

  let expanded = $state(false)
  const visible = $derived(expanded ? albums : albums.slice(0, limit))
  const truncated = $derived(albums.length > limit)
</script>

{#if loading || albums.length}
{#if mobile}
  <section class="mobile-discovery-section" aria-label="新专辑">
    <h2>{title}</h2>
    <div class="mobile-cover-rail">
      {#if loading && !albums.length}
        {#each Array(4) as _, index (index)}<div class="mobile-cover-item"><span class="mobile-cover-image skeleton-block"></span><span class="skeleton-line"></span></div>{/each}
      {:else}
        {#each visible as album (album.id)}
          <PreviewCard mobile title={String(album.name ?? '')} meta={String(album.artistName ?? '') || '新专辑'} cover={String(album.picUrl ?? '')} onSelect={() => onOpenAlbum?.(album.id)} />
        {/each}
      {/if}
    </div>
    {#if truncated}<button class="music-preview-more" type="button" aria-expanded={expanded} onclick={() => expanded = !expanded}>{expanded ? '收起' : `展开全部 ${albums.length} 张`}</button>{/if}
  </section>
{:else}
  <section class="music-discovery-section music-new-albums-panel">
    <div class="music-section-head">
      <h2>{title}</h2>
      {#if truncated}<button class="music-preview-more" type="button" aria-expanded={expanded} onclick={() => expanded = !expanded}>{expanded ? '收起' : `展开全部 ${albums.length} 张`}</button>{/if}
    </div>
    <div class="music-card-rail music-album-rail">
      {#if loading && !albums.length}
        {#each Array(8) as _, index (index)}
          <div class="music-cover-card skeleton-row">
            <span class="music-cover-placeholder skeleton-block"></span>
            <strong class="skeleton-line"></strong>
            <em class="skeleton-line narrow"></em>
          </div>
        {/each}
      {:else}
        {#each visible as album (album.id)}
          <PreviewCard title={String(album.name ?? '')} meta={String(album.artistName ?? '') || '新专辑'} cover={String(album.picUrl ?? '')} onSelect={() => onOpenAlbum?.(album.id)} />
        {/each}
      {/if}
    </div>
  </section>
{/if}
{/if}
