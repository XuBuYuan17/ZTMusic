<script>
  import { slide } from 'svelte/transition'
  import { auth } from '../stores/auth.svelte.js'
  import { formatPlayCount } from '../format.js'
  import Spinner from '../components/Spinner.svelte'

  let {
    refreshKey = 0,
    loading = false,
    recentTracks = [],
    userPlaylists = [],
    subcount = null,
    likedPlaylist = null,
    weeklyPlaylist = null,
    onNavigate,
    onOpenLogin,
    onOpenPlaylist,
    onPlayRecentTrack,
  } = $props()

  function handleCardKeydown(event, action) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action?.()
    }
  }

  function openWeeklyOrRecent() {
    weeklyPlaylist ? onOpenPlaylist?.(weeklyPlaylist.id) : onNavigate?.('recent')
  }

  function openLiked() {
    if (likedPlaylist) onOpenPlaylist?.(likedPlaylist.id)
  }
</script>

<div transition:slide={{ duration: 280, axis: 'x' }}>
  {#if auth.isLoggedIn}
    <!-- Apple Music-style Hero -->
    <div class="home-hero">
      <div class="home-hero-bg" style="background-image:url({(auth.user?.avatarUrl || '') + `?param=800y400&_=${refreshKey}`})"></div>
      <div class="home-hero-gradient"></div>
      <div class="home-hero-content">
        <div class="home-hero-avatar">
          {#if auth.user?.avatarUrl}
            <img src={auth.user.avatarUrl + `?param=200y200&_=${refreshKey}`} alt="" referrerpolicy="no-referrer" />
          {:else}
            <div class="home-hero-avatar-placeholder">{auth.user?.nickname?.charAt(0) || '?'}</div>
          {/if}
        </div>
        <div class="home-hero-text">
          <div class="home-hero-greeting">你好，{auth.user?.nickname || '用户'}</div>
          <div class="home-hero-sub">今天想听点什么？</div>
        </div>
      </div>
    </div>

    <!-- Music Taste — Apple Music style cards -->
    <div class="home-section">
      <div class="home-section-header">
        <h2 class="home-section-title">你的音乐品味</h2>
      </div>
      <div class="home-taste-grid">
        <div class="home-taste-card home-taste-rank" role="button" tabindex="0" onclick={openWeeklyOrRecent} onkeydown={(event) => handleCardKeydown(event, openWeeklyOrRecent)}>
          <div class="home-taste-card-bg" style="background-image:url({(weeklyPlaylist?.picUrl || likedPlaylist?.picUrl || auth.user?.avatarUrl || '') + '?param=400y400'})"></div>
          <div class="home-taste-card-gradient"></div>
          <div class="home-taste-card-body">
            <div class="home-taste-card-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
            </div>
            <div class="home-taste-card-title">听歌排行</div>
            <div class="home-taste-card-sub">{weeklyPlaylist ? formatPlayCount(weeklyPlaylist.playCount) : (subcount?.playedCount ? formatPlayCount(subcount.playedCount) : '最近播放')}</div>
          </div>
        </div>
        <div class="home-taste-card home-taste-liked" role="button" tabindex="0" onclick={openLiked} onkeydown={(event) => handleCardKeydown(event, openLiked)}>
          <div class="home-taste-card-bg" style="background-image:url({(likedPlaylist?.picUrl || '') + '?param=400y400'})"></div>
          <div class="home-taste-card-gradient"></div>
          <div class="home-taste-card-body">
            <div class="home-taste-card-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
            <div class="home-taste-card-title">喜欢的音乐</div>
            <div class="home-taste-card-sub">{likedPlaylist?.trackCount ?? subcount?.likedCount ?? 0} 首歌曲</div>
          </div>
        </div>
      </div>
    </div>

    {#if loading}
      <div class="loading-state">
        <Spinner size="lg" label="加载中" />
      </div>
    {:else}
      {#if recentTracks.length > 0}
        <div class="home-section">
          <div class="home-section-header">
            <h2 class="home-section-title">最近播放</h2>
            <button class="home-section-more" onclick={() => onNavigate?.('recent')}>查看全部</button>
          </div>
          <div class="home-scroll">
            <div class="home-scroll-track">
              {#each recentTracks.slice(0, 12) as track (track.id)}
                <div class="home-song-card" role="button" tabindex="0" onclick={() => onPlayRecentTrack?.(track)} onkeydown={(event) => handleCardKeydown(event, () => onPlayRecentTrack?.(track))}>
                  <div class="home-song-cover">
                    {#if track.picUrl}
                      <img src={track.picUrl + '?param=200y200'} alt="" loading="lazy" />
                    {:else}
                      <div class="home-song-cover-placeholder">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      </div>
                    {/if}
                    <div class="home-song-play">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <div class="home-song-name">{track.name}</div>
                  <div class="home-song-artist">{(track.ar || []).map(a => a.name).join(', ') || ''}</div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      {#if userPlaylists.length > 0}
        <div class="home-section">
          <div class="home-section-header">
            <h2 class="home-section-title">收藏的歌单</h2>
          </div>
          <div class="home-scroll">
            <div class="home-scroll-track">
              {#each userPlaylists as pl (pl.id)}
                <div class="home-playlist-card" role="button" tabindex="0" onclick={() => onOpenPlaylist?.(pl.id)} onkeydown={(event) => handleCardKeydown(event, () => onOpenPlaylist?.(pl.id))}>
                  <div class="home-playlist-cover">
                    {#if pl.picUrl}
                      <img src={pl.picUrl + '?param=400y400'} alt="" loading="lazy" />
                    {:else}
                      <div class="home-playlist-cover-placeholder">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      </div>
                    {/if}
                    <div class="home-playlist-play">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <div class="home-playlist-name">{pl.name}</div>
                  <div class="home-playlist-meta">{pl.trackCount} 首</div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      {#if userPlaylists.length === 0 && !loading && recentTracks.length === 0}
        <div class="home-empty">
          <div class="home-empty-icon">
            <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <p class="home-empty-text">开始探索音乐吧</p>
          <button class="home-empty-btn" onclick={() => onNavigate?.('explore')}>去发现</button>
        </div>
      {/if}
    {/if}
  {:else}
    <div class="home-logged-out">
      <div class="home-logged-out-icon">
        <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <h2 class="home-logged-out-title">登录后开启音乐之旅</h2>
      <p class="home-logged-out-sub">查看你的听歌排行、喜欢的音乐和收藏的歌单</p>
      <button class="home-logged-out-btn" onclick={onOpenLogin}>立即登录</button>
    </div>
  {/if}
</div>
