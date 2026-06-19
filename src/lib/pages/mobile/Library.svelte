<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { coverUrl } from '../../utils/image.js'

  let {
    libraryPlaylists = [],
    libraryLoading = false,
    onOpenPlaylist,
    onOpenLogin,
  } = $props()

  let segment = $state('playlists')
</script>

<div class="mlib-page">
  <h1 class="mlib-title">资料库</h1>

  {#if !auth.isLoggedIn}
    <div class="mlib-logged-out">
      <div class="mlib-logged-out-icon">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </div>
      <h2 class="mlib-logged-out-title">登录后查看资料库</h2>
      <p class="mlib-logged-out-desc">登录后可查看收藏的歌单和专辑</p>
      <button class="mlib-login-btn" onclick={() => onOpenLogin?.()}>立即登录</button>
    </div>
  {:else}
    <!-- Segmented Control -->
    <div class="mlib-segmented">
      <button class="mlib-seg-btn" class:active={segment === 'playlists'} onclick={() => segment = 'playlists'}>
        播放列表
      </button>
      <button class="mlib-seg-btn" class:active={segment === 'albums'} onclick={() => segment = 'albums'}>
        专辑
      </button>
    </div>

    <!-- Playlists List -->
    {#if segment === 'playlists'}
      {#if libraryLoading && libraryPlaylists.length === 0}
        <div class="mlib-loading">加载中…</div>
      {:else if libraryPlaylists.length > 0}
        <div class="mlib-list">
          {#each libraryPlaylists as pl (pl.id)}
            <button class="mlib-row" onclick={() => onOpenPlaylist?.(pl.id, true, pl)}>
              <div class="mlib-row-cover">
                {#if pl.picUrl}
                  <img src={coverUrl(pl.picUrl, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                {:else}
                  <div class="mlib-row-placeholder">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  </div>
                {/if}
              </div>
              <div class="mlib-row-info">
                <div class="mlib-row-name">{pl.name}</div>
                {#if pl.trackCount}
                  <div class="mlib-row-meta">{pl.trackCount} 首</div>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {:else}
        <div class="mlib-empty">暂无播放列表</div>
      {/if}
    {:else}
      <!-- Albums (static empty state for now) -->
      <div class="mlib-empty">
        <p>专辑功能即将上线</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .mlib-page {
    padding: 0 0 20px;
  }

  .mlib-title {
    padding: 6px 20px 10px;
    font-size: 28px;
    font-weight: 800;
    color: #fff;
    letter-spacing: 0;
  }

  /* ===== Segmented Control ===== */
  .mlib-segmented {
    display: flex;
    gap: 0;
    padding: 0 20px;
    margin-bottom: 16px;
  }

  .mlib-seg-btn {
    flex: 1;
    padding: 6px 14px;
    border-radius: 16px;
    background: #2c2c2e;
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .mlib-seg-btn.active {
    background: #fc3c44;
    color: #fff;
  }

  .mlib-seg-btn:not(.active):active {
    opacity: 0.7;
  }

  /* ===== List ===== */
  .mlib-list {
    padding: 0 20px;
  }

  .mlib-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 0;
    border: none;
    background: none;
    color: #fff;
    cursor: pointer;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }

  .mlib-row:active {
    opacity: 0.7;
  }

  .mlib-row-cover {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    background: linear-gradient(135deg, #2a1a5e, #1a3a6e);
  }

  .mlib-row-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mlib-row-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.3);
  }

  .mlib-row-info {
    flex: 1;
    min-width: 0;
  }

  .mlib-row-name {
    font-size: 15px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mlib-row-meta {
    font-size: 12px;
    color: #8e8e93;
    margin-top: 2px;
  }

  /* ===== Logged Out ===== */
  .mlib-logged-out {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 60px 40px;
    text-align: center;
  }

  .mlib-logged-out-icon {
    color: #8e8e93;
    margin-bottom: 16px;
  }

  .mlib-logged-out-title {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
  }

  .mlib-logged-out-desc {
    font-size: 13px;
    color: #8e8e93;
    margin-bottom: 24px;
  }

  .mlib-login-btn {
    padding: 10px 28px;
    border-radius: 20px;
    border: none;
    background: #fc3c44;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .mlib-login-btn:active {
    opacity: 0.8;
  }

  /* ===== States ===== */
  .mlib-loading,
  .mlib-empty {
    padding: 40px 20px;
    text-align: center;
    color: #8e8e93;
    font-size: 14px;
  }
</style>
