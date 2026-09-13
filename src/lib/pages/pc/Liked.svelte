<script lang="ts">
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
  import Icon from '../../components/ui/Icon.svelte'

  interface RefArtist { id?: SongId; name?: unknown }

  let {
    onOpenArtist,
    onOpenAlbum,
  }: {
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
  } = $props()

  let songs = $state<NormalizedSong[]>([])
  let loading = $state(true)
  let error = $state('')

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
      if (ids.length === 0) {
        songs = []
        return
      }
      songs = (await musicService.getTracks(ids as SongId[])).map(normalizeSong).filter((s): s is NormalizedSong => s !== null)
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

  $effect(() => {
    if (auth.isLoggedIn) loadLiked()
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

  {#if loading}
    <div class="liked-skeleton">
      {#each Array(10) as _, i}
        <div class="liked-skeleton-row" style="animation-delay:{i * 30}ms">
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
  {:else if error}
    <div class="liked-empty">
      <Icon name="empty" size={48} />
      <p>{error}</p>
    </div>
  {:else if songs.length === 0}
    <div class="liked-empty">
      <Icon name="heart" size={48} />
      <p>还没有喜欢的歌曲</p>
      <p style="font-size:13px;color:var(--text-tertiary)">在播放时点击 ♥ 按钮添加</p>
    </div>
  {:else}
    {#key songs.length}
      <div class="liked-song-list">
        {#each songs as track, i (track.id as SongId)}
          <div class="liked-song-row" role="button" tabindex="0"
            class:active={player.id === track.id}
            onclick={() => playTrack(track)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playTrack(track) } }}>
            <span class="liked-song-index">{i + 1}</span>
            <img class="liked-song-cover" src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
            <span class="liked-song-main">
              <strong>{track.name}</strong>
              <em>
                {#each artistsOf(track) as artist, j ((artist.id || artist.name) as SongId)}
                  {#if j > 0}<span class="artist-sep">/</span>{/if}
                  {#if artist.id}
                    <button class="artist-link" onclick={(e) => { e.stopPropagation(); onOpenArtist?.(artist.id) }}>{artist.name}</button>
                  {:else}
                    <span>{artist.name}</span>
                  {/if}
                {/each}
              </em>
            </span>
            <span class="liked-song-dur">{formatDuration(track.dt || (track.duration as number) || 0)}</span>
          </div>
        {/each}
      </div>
    {/key}
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
    animation: likedFadeIn 0.32s var(--ease-out) both;
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
    height: 42px;
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
    transition: background 0.18s var(--ease-out), transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out);
  }

  .liked-hero-play:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 16px 32px rgba(230, 0, 18, 0.28);
  }

  .liked-hero-play:active {
    transform: translateY(0) scale(0.97);
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
    animation: likedFadeIn 0.3s both;
  }

  .liked-song-list {
    display: grid;
    gap: 2px;
    overflow: visible;
  }

  .liked-song-row {
    display: grid;
    grid-template-columns: 38px 48px minmax(0, 1fr) 70px;
    gap: 12px;
    align-items: center;
    min-height: 64px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    animation: likedFadeIn 0.28s var(--ease-out) both;
    transition: background 0.15s var(--ease-out), transform 0.15s var(--ease-out);
  }

  .liked-song-row:hover {
    background: var(--bg-hover);
  }

  .liked-song-row:active {
    transform: scale(0.995);
  }

  .liked-song-row.active {
    background: var(--accent-bg);
    color: var(--accent);
  }

  .liked-song-index {
    color: var(--text-tertiary);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }

  .liked-song-cover {
    width: 48px;
    height: 48px;
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    border-radius: var(--radius-xs);
    object-fit: cover;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
  }

  .liked-song-main {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .liked-song-main strong {
    overflow: hidden;
    color: var(--text);
    font-size: 14px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .liked-song-main em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .liked-song-dur {
    color: var(--text-tertiary);
    font-size: 12px;
    font-weight: 700;
    text-align: right;
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

  .artist-sep {
    margin: 0 3px;
    color: var(--text-tertiary);
  }

  .artist-link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    font: inherit;
  }

  .artist-link:hover {
    text-decoration: underline;
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

    .liked-song-row {
      grid-template-columns: 42px minmax(0, 1fr) 46px;
      gap: 10px;
      min-height: 58px;
      padding: 7px 2px;
    }

    .liked-song-index {
      display: none;
    }

    .liked-song-cover {
      width: 42px;
      height: 42px;
    }

    .liked-song-dur {
      font-size: 11px;
    }
  }

  @keyframes likedFadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
