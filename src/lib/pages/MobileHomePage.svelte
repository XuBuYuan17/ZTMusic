<script>
  import { auth } from '../stores/auth.svelte.js'
  import { coverUrl } from '../utils/image.js'
  import { extractCover } from '../utils/normalize.js'
  import ArtistNames from '../components/ArtistNames.svelte'

  let {
    loading = false,
    recentTracks = [],
    userPlaylists = [],
    subcount = null,
    likedPlaylist = null,
    weeklyPlaylist = null,
    recommendPlaylists = [],
    onNavigate,
    onOpenLogin,
    onOpenPlaylist,
    onPlayRecentTrack,
    onOpenArtist,
    onOpenFollows,
  } = $props()

  const heroPlaylist = $derived(recommendPlaylists[0] || null)
  const recentPreview = $derived(recentTracks.slice(0, 6))
  const libraryPreview = $derived(userPlaylists.slice(0, 5))

  function coverOf(track) {
    return track?.picUrl || extractCover(track)
  }

  function openLiked() {
    if (likedPlaylist) onOpenPlaylist?.(likedPlaylist.id, true, likedPlaylist)
  }
</script>

<div class="mobile-home-page">
  {#if auth.isLoggedIn}
    <section class="mobile-home-hero">
      <div>
        <p>为你准备</p>
        <h1>{auth.user?.nickname || '今天'}，听点什么？</h1>
      </div>
      <button type="button" class="mobile-home-hero-card" disabled={!heroPlaylist} onclick={() => heroPlaylist && onOpenPlaylist?.(heroPlaylist.id, true, heroPlaylist)}>
        {#if heroPlaylist?.picUrl}
          <img src={coverUrl(heroPlaylist.picUrl, 180)} alt="" loading="lazy" referrerpolicy="no-referrer" />
        {:else if auth.user?.avatarUrl}
          <img src={coverUrl(auth.user.avatarUrl, 180)} alt="" loading="lazy" referrerpolicy="no-referrer" />
        {:else}
          <span>♫</span>
        {/if}
        <strong>{heroPlaylist?.name || '私人首页'}</strong>
        <em>{heroPlaylist?.copywriter || '继续你的音乐旅程'}</em>
      </button>
    </section>

    <section class="mobile-home-actions" aria-label="快捷入口">
      <button type="button" onclick={() => onOpenFollows?.()}>
        <span>关注</span>
        <strong>粉丝 / 关注</strong>
      </button>
      <button type="button" onclick={openLiked} disabled={!likedPlaylist}>
        <span>喜欢</span>
        <strong>{likedPlaylist?.trackCount ?? subcount?.likedCount ?? 0} 首</strong>
      </button>
      <button type="button" onclick={() => onNavigate?.('recent')}>
        <span>最近</span>
        <strong>{recentTracks.length} 首</strong>
      </button>
    </section>

    <section class="mobile-home-section">
      <div class="mobile-home-section-head">
        <h2>继续播放</h2>
        <button type="button" onclick={() => onNavigate?.('recent')}>全部</button>
      </div>
      {#if loading && recentPreview.length === 0}
        <div class="mobile-home-library">
          {#each Array(4) as _}
            <button type="button" aria-label="继续播放加载中" disabled>
              <span class="mobile-home-cover-ph skeleton-block"></span>
              <span>
                <strong class="skeleton-line"></strong>
                <em class="skeleton-line narrow"></em>
              </span>
            </button>
          {/each}
        </div>
      {:else if recentPreview.length > 0}
        <div class="mobile-home-library">
          {#each recentPreview as track (track.id)}
            <button type="button" onclick={() => onPlayRecentTrack?.(track)}>
              {#if coverOf(track)}
                <img src={coverUrl(coverOf(track), 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {:else}
                <span class="mobile-home-cover-ph">♫</span>
              {/if}
              <span>
                <strong>{track.name}</strong>
                <em><ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} /></em>
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="mobile-home-empty">还没有最近播放</div>
      {/if}
    </section>

    <section class="mobile-home-section">
      <div class="mobile-home-section-head">
        <h2>你的资料库</h2>
        <button type="button" onclick={() => onNavigate?.('library')}>进入</button>
      </div>
      {#if loading && libraryPreview.length === 0}
        <div class="mobile-home-list">
          {#each Array(4) as _}
            <div class="mobile-home-row skeleton-row">
              <span class="mobile-home-row-cover skeleton-block"></span>
              <span class="mobile-home-row-main">
                <strong class="skeleton-line"></strong>
                <em class="skeleton-line narrow"></em>
              </span>
            </div>
          {/each}
        </div>
      {:else if libraryPreview.length > 0}
        <div class="mobile-home-list">
          {#each libraryPreview as playlist (playlist.id)}
            <button type="button" class="mobile-home-row" onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>
              {#if playlist.picUrl}
                <img class="mobile-home-row-cover" src={coverUrl(playlist.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {:else}
                <span class="mobile-home-row-cover mobile-home-cover-ph">♫</span>
              {/if}
              <span class="mobile-home-row-main">
                <strong>{playlist.name}</strong>
                <em>{playlist.trackCount || 0} 首</em>
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="mobile-home-empty">收藏的歌单会显示在这里</div>
      {/if}
    </section>
  {:else}
    <section class="mobile-home-login">
      <div class="mobile-home-login-icon">♫</div>
      <h1>登录后开启音乐之旅</h1>
      <p>同步你的喜欢、最近播放和收藏歌单。</p>
      <button type="button" onclick={onOpenLogin}>立即登录</button>
    </section>
  {/if}
</div>

<style>
  .mobile-home-page {
    display: none;
  }

  @media (max-width: 760px) {
    .mobile-home-page {
      display: grid;
      gap: 16px;
      padding-bottom: 8px;
    }

    .mobile-home-hero {
      display: grid;
      gap: 14px;
      padding: 4px 2px 0;
    }

    .mobile-home-hero p,
    .mobile-home-hero h1,
    .mobile-home-login h1,
    .mobile-home-login p {
      margin: 0;
    }

    .mobile-home-hero p {
      color: var(--text-tertiary);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }

    .mobile-home-hero h1 {
      margin-top: 4px;
      font-size: 25px;
      line-height: 1.1;
      letter-spacing: -0.05em;
    }

    .mobile-home-hero-card {
      position: relative;
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      grid-template-rows: auto auto;
      align-items: center;
      gap: 6px 12px;
      width: 100%;
      min-height: 88px;
      padding: 12px;
      overflow: hidden;
      border: 0;
      border-radius: 18px;
      color: #fff;
      text-align: left;
      background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 72%, #111), #1d1d22);
      box-shadow: 0 18px 42px color-mix(in srgb, var(--accent) 18%, transparent);
    }

    .mobile-home-hero-card:disabled {
      opacity: 0.84;
    }

    .mobile-home-hero-card img,
    .mobile-home-hero-card > span {
      grid-row: 1 / 3;
      width: 64px;
      height: 64px;
      border-radius: 14px;
      object-fit: cover;
      background: rgba(255,255,255,0.16);
    }

    .mobile-home-hero-card > span {
      display: grid;
      place-items: center;
      font-size: 30px;
    }

    .mobile-home-hero-card strong,
    .mobile-home-hero-card em,
    .mobile-home-row-main strong,
    .mobile-home-row-main em,
    .mobile-home-library strong,
    .mobile-home-library em {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-home-hero-card strong {
      font-size: 17px;
      line-height: 1.2;
    }

    .mobile-home-hero-card em {
      align-self: start;
      color: rgba(255,255,255,0.72);
      font-size: 12px;
      font-style: normal;
    }

    .mobile-home-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .mobile-home-actions button {
      display: grid;
      gap: 5px;
      min-height: 58px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 14px;
      color: var(--text-primary);
      text-align: left;
      background: var(--bg-elevated);
    }

    .mobile-home-actions button:disabled {
      opacity: 0.5;
    }

    .mobile-home-actions span {
      color: var(--text-tertiary);
      font-size: 12px;
    }

    .mobile-home-actions strong {
      font-size: 14px;
      line-height: 1.15;
    }

    .mobile-home-section {
      display: grid;
      gap: 12px;
    }

    .mobile-home-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .mobile-home-section-head h2 {
      margin: 0;
      font-size: 20px;
      letter-spacing: -0.04em;
    }

    .mobile-home-section-head button {
      border: 0;
      color: var(--accent);
      background: transparent;
      font-size: 13px;
      font-weight: 800;
    }

    .mobile-home-list,
    .mobile-home-library {
      display: grid;
      gap: 8px;
    }

    .mobile-home-row,
    .mobile-home-library button {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 64px;
      padding: 8px;
      border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
      border-radius: 18px;
      color: var(--text-primary);
      text-align: left;
      background: color-mix(in srgb, var(--bg-elevated) 80%, transparent);
    }

    .mobile-home-row-cover,
    .mobile-home-library img,
    .mobile-home-library .mobile-home-cover-ph {
      width: 48px;
      height: 48px;
      border-radius: 13px;
      object-fit: cover;
      background: var(--bg-layer);
    }

    .mobile-home-row-main,
    .mobile-home-library span {
      display: grid;
      min-width: 0;
      gap: 4px;
    }

    .mobile-home-row-main strong,
    .mobile-home-library strong {
      font-size: 14px;
      line-height: 1.2;
    }

    .mobile-home-row-main em,
    .mobile-home-library em {
      color: var(--text-secondary);
      font-size: 12px;
      font-style: normal;
    }

    .mobile-home-cover-ph {
      display: grid;
      place-items: center;
      color: var(--text-tertiary);
    }

    .mobile-home-empty {
      display: grid;
      place-items: center;
      min-height: 82px;
      border: 1px dashed var(--border);
      border-radius: 18px;
      color: var(--text-tertiary);
      font-size: 13px;
    }

    .mobile-home-login {
      display: grid;
      place-items: center;
      gap: 12px;
      min-height: 56vh;
      padding: 24px;
      text-align: center;
    }

    .mobile-home-login-icon {
      display: grid;
      place-items: center;
      width: 72px;
      height: 72px;
      border-radius: 24px;
      color: #fff;
      background: var(--accent);
      font-size: 32px;
      box-shadow: 0 18px 42px color-mix(in srgb, var(--accent) 26%, transparent);
    }

    .mobile-home-login h1 {
      font-size: 24px;
      letter-spacing: -0.04em;
    }

    .mobile-home-login p {
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.5;
    }

    .mobile-home-login button {
      height: 42px;
      padding: 0 22px;
      border: 0;
      border-radius: 999px;
      color: #fff;
      background: var(--accent);
      font-weight: 800;
    }
  }
</style>
