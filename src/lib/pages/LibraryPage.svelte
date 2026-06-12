<script>
  import { auth } from '../stores/auth.svelte.js'

  let {
    libraryPlaylists = [],
    libraryLoading = false,
    onOpenLogin,
    onOpenPlaylist,
  } = $props()
</script>

<div class="library-page fade-in">
  {#if !auth.isLoggedIn}
    <div class="library-logged-out">
      <div class="library-hero-icon">
        <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </div>
      <h2>登录后查看收藏</h2>
      <p>你收藏的歌单都会在这里显示</p>
      <button class="library-login-btn" onclick={onOpenLogin}>立即登录</button>
    </div>
  {:else}
    <div class="library-header">
      <div class="library-header-info">
        <h1>我的收藏</h1>
        <span class="library-count">{libraryPlaylists.length} 个歌单</span>
      </div>
    </div>
    {#if libraryLoading && libraryPlaylists.length === 0}
      <div class="library-grid" aria-label="加载收藏歌单">
        {#each Array(10) as _}
          <div class="library-card library-card-skeleton">
            <div class="library-card-cover skeleton-block"></div>
            <div class="library-card-info">
              <div class="library-card-name skeleton-line"></div>
              <div class="library-card-meta skeleton-line narrow"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else if libraryPlaylists.length > 0}
      <div class="library-grid">
        {#each libraryPlaylists as pl (pl.id)}
          <div class="library-card" role="button" tabindex="0" onclick={() => onOpenPlaylist?.(pl.id, true, pl)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPlaylist?.(pl.id, true, pl) } }}>
            <div class="library-card-cover">
              {#if pl.picUrl}
                <img src={pl.picUrl + '?param=400y400'} alt={pl.name} loading="lazy" />
              {:else}
                <div class="library-card-placeholder">
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
              {/if}
              <div class="library-card-play-btn">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <div class="library-card-info">
              <div class="library-card-name">{pl.name}</div>
              <div class="library-card-meta">
                {#if pl.trackCount}
                  <span>{pl.trackCount} 首</span>
                {/if}
                {#if pl.creator}
                  <span class="library-card-creator">· {pl.creator}</span>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="library-empty">
        <div class="library-empty-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </div>
        <p>还没有收藏的歌单</p>
        <p class="library-empty-sub">去发现页面收藏你喜欢的歌单吧</p>
      </div>
    {/if}
  {/if}
</div>
