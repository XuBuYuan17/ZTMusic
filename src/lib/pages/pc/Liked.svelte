<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { ncm } from '../../api/client.js'
  import { musicService } from '../../music/service.js'
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
      songs = (await musicService.getTracks(ids)).map(normalizeSong).filter(Boolean)
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
  .liked-page { display: grid; gap: 22px; max-width: 1180px; margin: 0 auto; }
  .liked-hero { min-height: 188px; display: grid; grid-template-columns: 168px minmax(0, 1fr) auto; align-items: end; gap: 24px; padding: 18px 0 24px; border-bottom: 1px solid var(--border); }
  .liked-hero-art { width: 168px; height: 168px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,0.18); border-radius: var(--radius-sm); color: #fff; background: linear-gradient(145deg, #ff2d55, #d70015 62%, #8e1d3d); box-shadow: 0 14px 32px rgba(157, 18, 53, 0.22); }
  .liked-hero-copy { min-width: 0; padding-bottom: 2px; }
  .liked-kicker { margin-bottom: 7px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
  .liked-hero h1 { margin: 0; font-size: clamp(32px, 3vw, 44px); line-height: 1.04; letter-spacing: 0; }
  .liked-hero p { margin-top: 10px; color: var(--text-secondary); font-size: 14px; }
  .liked-hero-meta { margin-top: 14px; color: var(--text-tertiary); font-size: 12px; font-weight: 500; }
  .liked-hero-play { min-width: 104px; height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 18px; border: none; border-radius: var(--radius-sm); background: var(--accent); color: white; font-weight: 700; cursor: pointer; transition: background 0.15s, transform 0.15s; }
  .liked-hero-play:hover { background: var(--accent-hover); }
  .liked-hero-play:active { transform: scale(0.97); }
  .liked-skeleton { display: grid; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-elevated); overflow: hidden; }
  .liked-skeleton-row { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-bottom: 1px solid var(--border); animation: likedFadeIn 0.3s both; }
  .liked-song-list { display: grid; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-elevated); }
  .liked-song-row { display: grid; grid-template-columns: 38px 44px minmax(0, 1fr) 64px; gap: 12px; align-items: center; min-height: 60px; padding: 7px 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.12s; }
  .liked-song-row:last-child { border-bottom: none; }
  .liked-song-row:hover { background: var(--bg-hover); }
  .liked-song-row.active { background: var(--accent-bg); color: var(--accent); }
  .liked-song-index { color: var(--text-tertiary); font-size: 12px; font-weight: 500; text-align: center; }
  .liked-song-cover { width: 44px; height: 44px; border: 1px solid var(--border); border-radius: var(--radius-xs); object-fit: cover; }
  .liked-song-main { min-width: 0; display: grid; gap: 2px; }
  .liked-song-main strong { overflow: hidden; color: var(--text); font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
  .liked-song-main em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-style: normal; font-size: 12px; color: var(--text-tertiary); }
  .liked-song-dur { color: var(--text-tertiary); font-size: 12px; text-align: right; }
  .liked-empty { display: grid; place-items: center; gap: 12px; padding: 80px 20px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-secondary); text-align: center; }
  .artist-sep { margin: 0 3px; color: var(--text-tertiary); }
  .artist-link { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font: inherit; }
  .artist-link:hover { text-decoration: underline; }
  @media (max-width: 760px) {
    .liked-page { gap: 14px; }
    .liked-hero { min-height: 0; grid-template-columns: 94px minmax(0, 1fr); gap: 14px; padding: 8px 2px 18px; }
    .liked-hero-art { width: 94px; height: 94px; box-shadow: 0 10px 24px rgba(157, 18, 53, 0.2); }
    .liked-hero-art :global(svg) { width: 34px; height: 34px; }
    .liked-kicker { margin-bottom: 3px; font-size: 10px; }
    .liked-hero h1 { font-size: 24px; }
    .liked-hero p { display: none; }
    .liked-hero-meta { margin-top: 7px; }
    .liked-hero-play { grid-column: 1 / -1; width: 100%; height: 42px; }
    .liked-song-row { grid-template-columns: 42px minmax(0, 1fr) 42px; gap: 10px; min-height: 58px; padding: 7px 2px; }
    .liked-song-index { display: none; }
    .liked-song-cover { width: 42px; height: 42px; }
    .liked-song-dur { font-size: 11px; }
  }
  @keyframes likedFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
</style>
