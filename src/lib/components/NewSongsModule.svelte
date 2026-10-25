<script lang="ts">
  import Icon from './ui/Icon.svelte'
  import ArtistNames from './ArtistNames.svelte'
  import { progressiveCover } from '../utils/image.ts'
  import type { SongId } from '../types/music.ts'
  import PreviewCard from './PreviewCard.svelte'

  // 新歌预览：数据与动作都由页面给，模块只负责排列与截断说明。
  interface SongItem {
    id?: unknown
    name?: unknown
    picUrl?: unknown
    ar?: unknown
    artists?: unknown
  }

  let {
    songs = [],
    loading = false,
    mobile = false,
    limit = 12,
    title = '新歌速递',
    onPlaySong,
    bindSongRow,
    onOpenArtist,
  }: {
    songs?: SongItem[]
    loading?: boolean
    mobile?: boolean
    limit?: number
    title?: string
    onPlaySong?: (song: SongItem) => void
    bindSongRow?: (song: SongItem) => { oncontextmenu: (event: MouseEvent) => void }
    onOpenArtist?: (id: unknown) => void
  } = $props()

  let expanded = $state(false)
  const visible = $derived(expanded ? songs : songs.slice(0, limit))
  const truncated = $derived(songs.length > limit)

  interface ArtistRef { id?: SongId; name: string }

  function artistsOf(song: SongItem): ArtistRef[] {
    const list = Array.isArray(song.ar) ? song.ar : Array.isArray(song.artists) ? song.artists : []
    return list as ArtistRef[]
  }

  function hideBrokenImage(event: Event): void {
    const image = event.currentTarget
    if (image instanceof HTMLElement) image.style.visibility = 'hidden'
  }
</script>

{#if loading || songs.length}
{#if mobile}
  <section class="mobile-discovery-section" aria-label="新歌精选">
    <h2>{title}</h2>
    <div class="mobile-song-rail">
      {#if loading && !songs.length}
        {#each Array(2) as _, index (index)}<div class="mobile-song-group">{#each Array(3) as __, inner (inner)}<div class="mobile-song-row"><span class="mobile-song-cover skeleton-block"></span><span class="skeleton-line"></span></div>{/each}</div>{/each}
      {:else}
        {#each Array.from({ length: Math.ceil(visible.length / 3) }, (_, i) => visible.slice(i * 3, i * 3 + 3)) as group, groupIndex (groupIndex)}
          <div class="mobile-song-group">
            {#each group as song (song.id)}
              <div class="mobile-song-row">
                <button class="mobile-song-play" type="button" onclick={() => onPlaySong?.(song)} aria-label={`播放 ${String(song.name ?? '')}`}>
                  <span class="mobile-song-cover">{#if song.picUrl}<img use:progressiveCover={{ source: String(song.picUrl), size: 120 }} alt="" onerror={hideBrokenImage} loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="music" size={22} />{/if}</span>
                  <span class="mobile-song-copy"><strong>{String(song.name ?? '')}</strong><small>{artistsOf(song).map(artist => String((artist as { name?: unknown })?.name ?? '')).filter(Boolean).join(' / ') || '未知歌手'}</small></span>
                </button>
                <button class="mobile-song-more" type="button" aria-label={`更多操作：${String(song.name ?? '')}`} onclick={(event) => bindSongRow?.(song).oncontextmenu(event)}><Icon name="more" size={22} /></button>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
    </div>
    {#if truncated}<button class="music-preview-more" type="button" aria-expanded={expanded} onclick={() => expanded = !expanded}>{expanded ? '收起' : `展开全部 ${songs.length} 首`}</button>{/if}
  </section>
{:else}
  <section class="music-discovery-section music-new-songs-section">
    <div class="music-section-head">
      <h2>{title}</h2>
      {#if truncated}<button class="music-preview-more" type="button" aria-expanded={expanded} onclick={() => expanded = !expanded}>{expanded ? '收起' : `展开全部 ${songs.length} 首`}</button>{/if}
    </div>
    <div class="music-card-rail music-song-rail">
      {#if loading && !songs.length}
        {#each Array(8) as _, index (index)}
          <div class="music-cover-card skeleton-row">
            <span class="music-cover-placeholder skeleton-block"></span>
            <strong class="skeleton-line"></strong>
            <em class="skeleton-line narrow"></em>
          </div>
        {/each}
      {:else}
        {#each visible as song (song.id)}
          <button class="music-cover-card" type="button" data-motion="card" onclick={() => onPlaySong?.(song)}>
            {#if song.picUrl}<img use:progressiveCover={{ source: String(song.picUrl), size: 360 }} alt="" onerror={hideBrokenImage} loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
            <strong>{String(song.name ?? '')}</strong>
            <em><ArtistNames artists={artistsOf(song)} {onOpenArtist} fallback="未知艺人" /></em>
          </button>
        {/each}
      {/if}
    </div>
  </section>
{/if}
{/if}

<style>
  .mobile-song-cover { display: grid; place-items: center; }
</style>
