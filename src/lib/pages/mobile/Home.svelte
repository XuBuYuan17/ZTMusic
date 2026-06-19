<script>
  import { coverUrl } from '../../utils/image.js'

  let {
    recentTracks = [],
    recommendPlaylists = [],
    onOpenPlaylist,
    onPlaySong,
    onOpenAlbum,
    onOpenArtist,
  } = $props()

  function fmtTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const recentTracksData = $derived(
    recentTracks.slice(0, 10)
  )

  const recPlaylists = $derived(
    recommendPlaylists.slice(0, 10)
  )

  // Hero data — first recommend playlist, then fallback
  const hero = $derived({
    title: recPlaylists[0]?.name || recentTracksData[0]?.name || '午夜梦境',
    subtitle: recPlaylists[0]?.copywriter || '最新专辑',
    picUrl: recPlaylists[0]?.picUrl || recentTracksData[0]?.picUrl || '',
    id: recPlaylists[0]?.id || null,
  })

  const gradientColors = [
    'linear-gradient(135deg, #e8573a, #b83a1a)',
    'linear-gradient(135deg, #3d1f6e, #6b3fa0)',
    'linear-gradient(135deg, #1a6e3f, #2ea85c)',
    'linear-gradient(135deg, #6e3f1a, #b86a2e)',
    'linear-gradient(135deg, #1a3f6e, #2e6ab8)',
    'linear-gradient(135deg, #6e1a3f, #b82e6a)',
  ]
</script>

<div class="mh-page">
  <!-- Page Title -->
  <h1 class="mh-title">首页</h1>

  <!-- Hero Card -->
  {#if hero.id}
    <button class="mh-hero" onclick={() => hero.id && onOpenPlaylist?.(hero.id)}>
      <div class="mh-hero-bg">
        {#if hero.picUrl}
          <img src={coverUrl(hero.picUrl, 400)} alt="" referrerpolicy="no-referrer" />
        {/if}
      </div>
      <div class="mh-hero-content">
        <div class="mh-hero-sub">{hero.subtitle}</div>
        <div class="mh-hero-title">{hero.title}</div>
      </div>
      <div class="mh-hero-icon">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor" opacity="0.3"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </button>
  {/if}

  <!-- Recently Played -->
  {#if recentTracksData.length > 0}
    <section class="mh-section">
      <div class="mh-section-header">
        <h2 class="mh-section-title">最近播放</h2>
      </div>
      <div class="mh-hscroll">
        {#each recentTracksData as track (track.id)}
          <button class="mh-card-sm" onclick={() => onPlaySong?.(track)}>
            <div class="mh-card-sm-cover">
              {#if track.picUrl || track.cover}
                <img src={coverUrl(track.picUrl || track.cover, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {:else}
                <div class="mh-card-sm-placeholder">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                </div>
              {/if}
            </div>
            <div class="mh-card-sm-name">{track.name || track.title || ''}</div>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <!-- For You (recommend playlists) -->
  {#if recPlaylists.length > 0}
    <section class="mh-section">
      <div class="mh-section-header">
        <h2 class="mh-section-title">为你推荐</h2>
      </div>
      <div class="mh-hscroll">
        {#each recPlaylists as pl, i (pl.id)}
          <button class="mh-card-lg" onclick={() => onOpenPlaylist?.(pl.id)}>
            <div class="mh-card-lg-bg" style="background: {gradientColors[i % gradientColors.length]}">
              <div class="mh-card-lg-name">{pl.name}</div>
            </div>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Empty state -->
  {#if recentTracksData.length === 0 && recPlaylists.length === 0}
    <div class="mh-empty">
      <p>开始听歌，你的推荐会出现在这里</p>
    </div>
  {/if}
</div>

<style>
  .mh-page {
    padding: 0 0 20px;
  }

  .mh-title {
    padding: 6px 20px 10px;
    font-size: 28px;
    font-weight: 800;
    color: #fff;
    letter-spacing: 0;
  }

  /* ===== Hero Card ===== */
  .mh-hero {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin: 4px 20px 18px;
    height: 190px;
    border-radius: 18px;
    background: linear-gradient(160deg, #d42a3f, #5c1020);
    border: none;
    cursor: pointer;
    padding: 20px;
    text-align: left;
    color: #fff;
    width: calc(100% - 40px);
    overflow: hidden;
  }

  .mh-hero-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .mh-hero-bg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.25;
  }

  .mh-hero:active {
    transform: scale(0.98);
    transition: transform 0.1s;
  }

  .mh-hero-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 1;
  }

  .mh-hero-sub {
    font-size: 11px;
    opacity: 0.8;
  }

  .mh-hero-title {
    font-size: 20px;
    font-weight: 700;
  }

  .mh-hero-icon {
    z-index: 1;
    flex-shrink: 0;
  }

  /* ===== Sections ===== */
  .mh-section {
    margin-bottom: 6px;
  }

  .mh-section-header {
    padding: 8px 20px 10px;
  }

  .mh-section-title {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0;
  }

  .mh-hscroll {
    display: flex;
    gap: 12px;
    padding: 2px 20px 16px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x mandatory;
  }

  .mh-hscroll::-webkit-scrollbar {
    display: none;
  }

  /* ===== Small Card (140x140) ===== */
  .mh-card-sm {
    flex-shrink: 0;
    width: 140px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
    scroll-snap-align: start;
  }

  .mh-card-sm-cover {
    width: 140px;
    height: 140px;
    border-radius: 14px;
    overflow: hidden;
    background: linear-gradient(135deg, #2a1a5e, #1a3a6e);
  }

  .mh-card-sm-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mh-card-sm-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.3);
  }

  .mh-card-sm-name {
    margin-top: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #fff;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ===== Large Card (150x170 gradient) ===== */
  .mh-card-lg {
    flex-shrink: 0;
    width: 150px;
    height: 170px;
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
    scroll-snap-align: start;
  }

  .mh-card-lg-bg {
    width: 150px;
    height: 170px;
    border-radius: 14px;
    display: flex;
    align-items: flex-end;
    padding: 14px;
  }

  .mh-card-lg-name {
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .mh-card-lg:active .mh-card-lg-bg,
  .mh-card-sm:active .mh-card-sm-cover {
    transform: scale(0.97);
    transition: transform 0.1s;
  }

  /* ===== Empty ===== */
  .mh-empty {
    padding: 80px 20px;
    text-align: center;
    color: #8e8e93;
    font-size: 14px;
  }
</style>
