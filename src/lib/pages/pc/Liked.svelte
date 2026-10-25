<script module lang="ts">
  let likedSnapshot: { userId: unknown; songs: unknown[] } | null = null
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import type { SongId } from '../../types/music.ts'
  import type { NormalizedSong } from '../../utils/normalize.ts'
  import type { CompactTrackInput } from '../../player/queue.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import { musicService } from '../../music/service.ts'
  import { player } from '../../stores/player.svelte.ts'
  import { formatDuration } from '../../format.ts'
  import { coverUrl } from '../../utils/image.ts'
  import { normalizeSong } from '../../utils/normalize.ts'
  import Spinner from '../../components/Spinner.svelte'
  import SongListActions from '../../components/SongListActions.svelte'
  import SongList from '../../components/SongList.svelte'
  import { toSongRows } from '../../components/song-row.ts'
  import { LIKE_CHANGE } from '../../services/likes.ts'
  import Icon from '../../components/ui/Icon.svelte'

  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }

  interface RefArtist { id?: SongId; name?: unknown }

  let {
    onOpenArtist,
    onOpenAlbum,
    onOpenLogin,
  }: {
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onOpenLogin?: () => void
  } = $props()

  const initial = likedSnapshot?.userId === auth.user?.userId ? likedSnapshot : null
  let songs = $state<NormalizedSong[]>((initial?.songs as NormalizedSong[] | undefined) ?? [])
  let loading = $state(!initial)
  let error = $state('')
  let songActions = $state<{ bindRow: RowBinder } | null>(null)

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }

  async function loadLiked(): Promise<void> {
    const uid = auth.user?.userId
    if (!auth.isLoggedIn || !uid) return
    loading = true
    error = ''
    try {
      const res = await ncm.likelist(uid)
      const r = rec(res)
      const rawIds = r?.ids || rec(r?.data)?.ids || []
      const ids: unknown[] = Array.isArray(rawIds) ? rawIds : []
      songs = ids.length ? (await musicService.getTracks(ids as SongId[])).map(normalizeSong).filter((s): s is NormalizedSong => s !== null) : []
      likedSnapshot = { userId: uid, songs: [...songs] }
    } catch (e) {
      error = '加载失败'
      console.error(e)
    } finally {
      loading = false
    }
  }

  function playAll(): void {
    if (songs.length) player.playQueue(songs as unknown as CompactTrackInput[], 0)
  }

  function playTrack(track: NormalizedSong): void {
    const idx = songs.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(songs as unknown as CompactTrackInput[], idx)
    else player.playTrack(track as unknown as CompactTrackInput, 0)
  }

  function artistsOf(track: NormalizedSong): RefArtist[] {
    const list = track.ar || track.artists || []
    return Array.isArray(list) ? list as RefArtist[] : []
  }

  const rows = $derived(toSongRows(songs))

  $effect(() => {
    if (auth.isLoggedIn) untrack(loadLiked)
    else loading = false
  })

  // 菜单里取消喜欢后刷新列表与计数；请求失败不会触发事件，行保持原样
  $effect(() => {
    const refresh = () => void loadLiked()
    window.addEventListener(LIKE_CHANGE, refresh)
    return () => window.removeEventListener(LIKE_CHANGE, refresh)
  })
</script>

<div class="liked-page fade-in">
  <div class="liked-hero">
    <div class="liked-hero-art" aria-hidden="true">
      <Icon name="heart-filled" size={54} />
    </div>
    <div class="liked-hero-copy">
      <div class="liked-kicker">资料库 · 歌单</div>
      <h1>我喜欢的音乐</h1>
      <p>你收藏的歌曲都会保存在这里。</p>
      <div class="liked-hero-meta">哲听 · {songs.length} 首歌曲</div>
    </div>
    {#if songs.length > 0}
      <button class="liked-hero-play" onclick={playAll}><Icon name="play" size={18} />播放</button>
    {/if}
  </div>

  {#if loading && !songs.length}
    <div class="liked-skeleton">
      {#each Array(10) as _, i}
        <div class="liked-skeleton-row">
          <span class="skeleton-line" style="width:32px;height:32px;border-radius:var(--radius-sm)"></span>
          <span class="skeleton-line" style="width:48px;height:48px;border-radius:var(--radius-md)"></span>
          <span style="flex:1;display:grid;gap:4px">
            <span class="skeleton-line" style="width:60%"></span>
            <span class="skeleton-line" style="width:40%"></span>
          </span>
          <span class="skeleton-line" style="width:80px"></span>
        </div>
      {/each}
    </div>
  {:else if error && !songs.length}
    <div class="liked-empty">
      <Icon name="empty" size={48} />
      <p>{error}</p><button onclick={loadLiked}>重试</button>
    </div>
  {:else if songs.length === 0}
    <div class="liked-empty">
      <Icon name="heart" size={48} />
      <p>还没有喜欢的歌曲</p>
      <p style="font-size:13px;color:var(--text-tertiary)">在播放时点击 ♥ 按钮添加</p>
    </div>
  {:else}
    <SongList
      {rows}
      currentId={player.id}
      rowActions={songActions?.bindRow ?? null}
      emptyText="还没有喜欢的歌曲"
      onPlay={(row) => playTrack(row.source as NormalizedSong)}
      {onOpenArtist}
      {onOpenAlbum}
    />
  {/if}
</div>

<style>
  .liked-page {
    display: grid;
    gap: 26px;
    max-width: 1180px;
    margin: 0 auto;
  }

  .liked-hero {
    min-height: 230px;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr) auto;
    align-items: end;
    gap: 28px;
    padding: 20px 0 28px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  }

  .liked-hero-art {
    width: 210px;
    height: 210px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: var(--radius-md);
    color: #fff;
    background:
      radial-gradient(circle at 28% 22%, rgba(255, 255, 255, 0.26), transparent 26%),
      linear-gradient(145deg, #ff456f, #f01845 48%, #8f1739 100%);
    box-shadow: 0 18px 44px rgba(157, 18, 53, 0.28), 0 8px 18px rgba(0, 0, 0, 0.16);
  }

  .liked-hero-art :global(svg) {
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.18));
  }

  .liked-hero-copy {
    min-width: 0;
    padding-bottom: 4px;
  }

  .liked-kicker {
    margin-bottom: 8px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .liked-hero h1 {
    max-width: 760px;
    margin: 0;
    overflow-wrap: anywhere;
    font-size: clamp(38px, 4.6vw, 64px);
    line-height: 1.02;
    font-weight: 700;
    letter-spacing: 0;
  }

  .liked-hero p {
    margin-top: 12px;
    color: var(--text-secondary);
    font-size: 15px;
  }

  .liked-hero-meta {
    margin-top: 14px;
    color: var(--text-tertiary);
    font-size: 13px;
    font-weight: 500;
  }

  .liked-hero-play {
    min-width: 112px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 20px;
    border: none;
    border-radius: 999px;
    background: var(--accent);
    color: white;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 12px 26px rgba(230, 0, 18, 0.22);
  }

  .liked-hero-play:hover {
    background: var(--accent-hover);
  }

  .liked-skeleton {
    display: grid;
    gap: 2px;
  }

  .liked-skeleton-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 8px;
    border-radius: var(--radius-sm);
  }

  .liked-empty {
    display: grid;
    place-items: center;
    gap: 12px;
    padding: 80px 20px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    text-align: center;
  }

  @media (max-width: 860px) {
    .liked-hero {
      grid-template-columns: 156px minmax(0, 1fr);
      gap: 18px;
      min-height: 0;
    }

    .liked-hero-art {
      width: 156px;
      height: 156px;
    }

    .liked-hero-play {
      grid-column: 2;
      justify-self: start;
      margin-top: 4px;
    }
  }

  @media (max-width: 760px) {
    .liked-page {
      gap: 16px;
    }

    .liked-hero {
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 14px;
      padding: 8px 2px 18px;
    }

    .liked-hero-art {
      width: 96px;
      height: 96px;
      border-radius: var(--radius-sm);
      box-shadow: 0 10px 24px rgba(157, 18, 53, 0.2);
    }

    .liked-hero-art :global(svg) {
      width: 34px;
      height: 34px;
    }

    .liked-kicker {
      margin-bottom: 3px;
      font-size: 10px;
    }

    .liked-hero h1 {
      font-size: 24px;
    }

    .liked-hero p {
      display: none;
    }

    .liked-hero-meta {
      margin-top: 7px;
    }

    .liked-hero-play {
      grid-column: 1 / -1;
      width: 100%;
      height: 42px;
    }
  }
</style>

<SongListActions onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onBindRow={(fn: RowBinder) => { songActions = { bindRow: fn } }} />
