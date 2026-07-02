<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { ncm } from '../../api/client.js'
  import { player } from '../../stores/player.svelte.js'
  import { formatDuration } from '../../format.js'
  import { coverUrl } from '../../utils/image.js'
  import { normalizeSong } from '../../utils/normalize.js'
  import Spinner from '../../components/Spinner.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  let {
    onPlayTrack,
    onPlayAll,
    onOpenArtist,
    onOpenAlbum,
  } = $props()

  let songs = $state([])
  let loading = $state(true)
  let error = $state('')

  async function loadLiked() {
    if (!auth.isLoggedIn || !auth.user?.userId) return
    loading = true
    error = ''
    try {
      const res = await ncm.likelist(auth.user.userId)
      const ids = res.ids || res.data?.ids || []
      if (ids.length === 0) {
        songs = []
        return
      }
      const detailRes = await ncm.songDetail(ids)
      const raw = detailRes.songs || detailRes.data?.songs || []
      songs = raw.map(normalizeSong).filter(Boolean)
    } catch (e) {
      error = '加载失败'
      console.error(e)
    } finally {
      loading = false
    }
  }

  function playAll() {
    if (songs.length) player.playQueue(songs, 0)
  }

  function playTrack(track) {
    const idx = songs.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(songs, idx)
    else player.playTrack(track, 0)
  }

  function artistsOf(track) {
    return track.ar || track.artists || []
  }

  $effect(() => {
    if (auth.isLoggedIn) loadLiked()
  })
</script>

<div class="liked-page fade-in">
  <div class="liked-hero">
    <div class="liked-hero-icon">
      <Icon name="liked" size={64} strokeWidth={1} />
    </div>
    <div class="liked-hero-copy">
      <div class="liked-kicker">My Library</div>
      <h1>我喜欢的音乐</h1>
      <p>收藏你喜欢的每一首歌。</p>
      <div class="liked-hero-stats">
        <span>{songs.length} 首歌曲</span>
      </div>
    </div>
    {#if songs.length > 0}
      <button class="liked-hero-play" onclick={playAll}>播放全部</button>
    {/if}
  </div>

  {#if loading}
    <div class="liked-skeleton">
      {#each Array(10) as _, i}
        <div class="liked-skeleton-row" style="animation-delay:{i * 30}ms">
          <span class="skeleton-line" style="width:32px;height:32px;border-radius:8px"></span>
          <span class="skeleton-line" style="width:48px;height:48px;border-radius:12px"></span>
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
        {#each songs as track, i (track.id)}
          <div class="liked-song-row" role="button" tabindex="0"
            class:active={player.id === track.id}
            onclick={() => playTrack(track)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playTrack(track) } }}>
            <span class="liked-song-index">{i + 1}</span>
            <img class="liked-song-cover" src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
            <span class="liked-song-main">
              <strong>{track.name}</strong>
              <em>
                {#each artistsOf(track) as artist, j (artist.id || artist.name)}
                  {#if j > 0}<span class="artist-sep">/</span>{/if}
                  {#if artist.id}
                    <button class="artist-link" onclick={(e) => { e.stopPropagation(); onOpenArtist?.(artist.id) }}>{artist.name}</button>
                  {:else}
                    <span>{artist.name}</span>
                  {/if}
                {/each}
              </em>
            </span>
            <span class="liked-song-dur">{formatDuration(track.dt || track.duration || 0)}</span>
          </div>
        {/each}
      </div>
    {/key}
  {/if}
</div>

<style>
  .liked-page { display: grid; gap: 20px; }
  .liked-hero { position: relative; overflow: hidden; min-height: 200px; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 30px; border: 1px solid color-mix(in srgb, var(--border) 72%, transparent); border-radius: 28px; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--bg-layer)), color-mix(in srgb, var(--accent) 6%, var(--bg-surface))); }
  .liked-hero-icon { position: absolute; top: 30px; right: 30px; opacity: 0.15; }
  .liked-hero-copy { position: relative; z-index: 1; }
  .liked-kicker { color: var(--accent); font-size: 12px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; }
  .liked-hero h1 { font-size: clamp(32px, 3.6vw, 48px); line-height: 0.92; margin: 0; }
  .liked-hero p { margin-top: 10px; color: var(--text-secondary); font-size: 14px; }
  .liked-hero-stats { display: flex; gap: 8px; margin-top: 14px; }
  .liked-hero-stats span { display: inline-flex; align-items: center; padding: 0 12px; height: 30px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--text); font-size: 12px; font-weight: 760; }
  .liked-hero-play { flex-shrink: 0; height: 42px; padding: 0 20px; border: none; border-radius: 999px; background: var(--accent); color: white; font-weight: 850; cursor: pointer; z-index: 1; transition: transform 0.18s, filter 0.18s; }
  .liked-hero-play:hover { transform: translateY(-1px); filter: brightness(1.05); }
  .liked-skeleton { display: grid; gap: 6px; padding: 10px; }
  .liked-skeleton-row { display: flex; align-items: center; gap: 12px; padding: 8px 10px; animation: likedFadeIn 0.3s both; }
  .liked-song-list { display: grid; gap: 4px; padding: 8px; border: 1px solid color-mix(in srgb, var(--border) 78%, transparent); border-radius: 24px; background: color-mix(in srgb, var(--bg-layer) 82%, transparent); }
  .liked-song-row { display: grid; grid-template-columns: 36px 48px 1fr 56px; gap: 12px; align-items: center; padding: 6px 10px; border-radius: 14px; cursor: pointer; transition: background 0.16s; }
  .liked-song-row:hover { background: var(--bg-hover); }
  .liked-song-row.active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .liked-song-index { color: var(--text-tertiary); font-size: 13px; font-weight: 850; text-align: center; }
  .liked-song-cover { width: 48px; height: 48px; border-radius: 12px; object-fit: cover; }
  .liked-song-main { min-width: 0; display: grid; gap: 2px; }
  .liked-song-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .liked-song-main em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-style: normal; font-size: 13px; color: var(--text-tertiary); }
  .liked-song-dur { color: var(--text-tertiary); font-size: 13px; text-align: right; }
  .liked-empty { display: grid; place-items: center; gap: 12px; padding: 80px 20px; color: var(--text-secondary); text-align: center; }
  .artist-sep { margin: 0 3px; color: var(--text-tertiary); }
  .artist-link { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font: inherit; }
  .artist-link:hover { text-decoration: underline; }
  @keyframes likedFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
</style>
