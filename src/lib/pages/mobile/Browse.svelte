<script>
  import { coverUrl } from '../../utils/image.js'

  let {
    explorePersonalized = [],
    exploreTopPlaylists = [],
    exploreNewAlbums = [],
    exploreLoading = false,
    onOpenPlaylist,
    onSearch,
  } = $props()

  const allPlaylists = $derived([...explorePersonalized, ...exploreTopPlaylists])
  const newAlbums = $derived(exploreNewAlbums.slice(0, 8))

  const categories = ['流行', '嘻哈', '摇滚', '电子', '民谣', '古典', 'R&B', '爵士', '说唱', '古风']

  const cardGradients = [
    'linear-gradient(135deg, #e8573a, #b83a1a)',
    'linear-gradient(135deg, #3d1f6e, #6b3fa0)',
    'linear-gradient(135deg, #1a6e3f, #2ea85c)',
    'linear-gradient(135deg, #6e3f1a, #b86a2e)',
    'linear-gradient(135deg, #1a3f6e, #2e6ab8)',
    'linear-gradient(135deg, #6e1a3f, #b82e6a)',
  ]
</script>

<div class="mb-page">
  <!-- Page Title -->
  <h1 class="mb-title">浏览</h1>

  <!-- Search Bar -->
  <div class="mb-search">
    <button class="mb-search-btn" onclick={() => onSearch?.()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7.5"/><line x1="21" y1="21" x2="15.8" y2="15.8"/></svg>
      <span>搜索歌曲或艺人…</span>
    </button>
  </div>

  <!-- New Music -->
  {#if newAlbums.length > 0}
    <section class="mb-section">
      <div class="mb-section-header">
        <h2 class="mb-section-title">新音乐</h2>
      </div>
      <div class="mb-hscroll">
        {#each newAlbums as album (album.id)}
          <button class="mb-card-sm" onclick={() => onOpenPlaylist?.(album.id)}>
            <div class="mb-card-sm-cover" style="background: {cardGradients[Math.abs(album.id || 0) % cardGradients.length]}">
              {#if album.picUrl}
                <img src={coverUrl(album.picUrl, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {/if}
            </div>
            <div class="mb-card-sm-name">{album.name}</div>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Featured Playlists (2-column grid) -->
  {#if allPlaylists.length > 0}
    <section class="mb-section">
      <div class="mb-section-header">
        <h2 class="mb-section-title">精选播放列表</h2>
      </div>
      <div class="mb-grid">
        {#each allPlaylists.slice(0, 6) as pl (pl.id)}
          <button class="mb-grid-item" onclick={() => onOpenPlaylist?.(pl.id)}>
            <div class="mb-grid-cover" style="background: {cardGradients[Math.abs(pl.id || 0) % cardGradients.length]}">
              {#if pl.picUrl}
                <img src={coverUrl(pl.picUrl, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {/if}
            </div>
            <div class="mb-grid-name">{pl.name}</div>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Categories -->
  <section class="mb-section">
    <div class="mb-section-header">
      <h2 class="mb-section-title">分类</h2>
    </div>
    <div class="mb-tags">
      {#each categories as cat}
        <span class="mb-tag">{cat}</span>
      {/each}
    </div>
  </section>

  {#if exploreLoading && allPlaylists.length === 0}
    <div class="mb-loading">
      <div class="mb-loading-spinner"></div>
      <span>正在加载…</span>
    </div>
  {/if}
</div>

<style>
  .mb-page {
    padding: 0 0 20px;
  }

  .mb-title {
    padding: 6px 20px 10px;
    font-size: 28px;
    font-weight: 800;
    color: #fff;
    letter-spacing: 0;
  }

  /* ===== Search ===== */
  .mb-search {
    padding: 0 20px;
    margin-bottom: 18px;
  }

  .mb-search-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 16px;
    border-radius: 12px;
    background: rgba(255,255,255,0.08);
    color: #8e8e93;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    border: none;
    text-align: left;
  }

  .mb-search-btn:hover {
    background: rgba(255,255,255,0.12);
  }

  .mb-search-btn svg {
    flex-shrink: 0;
  }

  /* ===== Sections ===== */
  .mb-section {
    margin-bottom: 6px;
  }

  .mb-section-header {
    padding: 8px 20px 10px;
  }

  .mb-section-title {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0;
  }

  .mb-hscroll {
    display: flex;
    gap: 12px;
    padding: 2px 20px 16px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x mandatory;
  }

  .mb-hscroll::-webkit-scrollbar {
    display: none;
  }

  /* ===== Small Card ===== */
  .mb-card-sm {
    flex-shrink: 0;
    width: 140px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
    scroll-snap-align: start;
  }

  .mb-card-sm-cover {
    width: 140px;
    height: 140px;
    border-radius: 14px;
    overflow: hidden;
  }

  .mb-card-sm-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mb-card-sm-name {
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

  .mb-card-sm:active .mb-card-sm-cover {
    transform: scale(0.97);
    transition: transform 0.1s;
  }

  /* ===== Grid (2 columns) ===== */
  .mb-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 0 20px 16px;
  }

  .mb-grid-item {
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }

  .mb-grid-cover {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 14px;
    overflow: hidden;
  }

  .mb-grid-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mb-grid-name {
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

  .mb-grid-item:active .mb-grid-cover {
    transform: scale(0.97);
    transition: transform 0.1s;
  }

  /* ===== Tags ===== */
  .mb-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 2px 20px 20px;
  }

  .mb-tag {
    padding: 8px 16px;
    border-radius: 20px;
    background: #2c2c2e;
    color: #fff;
    font-size: 13px;
    font-weight: 500;
  }

  /* ===== Empty ===== */
  .mb-empty {
    padding: 60px 20px;
    text-align: center;
    color: #8e8e93;
    font-size: 14px;
  }

  /* ===== Loading ===== */
  .mb-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 60px 20px;
    color: #8e8e93;
    font-size: 13px;
  }

  .mb-loading-spinner {
    width: 24px;
    height: 24px;
    border: 2.5px solid rgba(255,255,255,0.1);
    border-top-color: #fc3c44;
    border-radius: 50%;
    animation: mspin 0.7s linear infinite;
  }

  @keyframes mspin {
    to { transform: rotate(360deg); }
  }
</style>
