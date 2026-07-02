<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { ncm } from '../../api/client.js'
  import { loadHomeData } from '../../services/home.js'
  import { coverUrl } from '../../utils/image.js'
  import Spinner from '../../components/Spinner.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  let { onOpenPlaylist, onOpenAlbum, onOpenArtist, onOpenLogin } = $props()

  let loading = $state(false)
  let recommendPlaylists = $state([])
  let recentTracks = $state([])
  let _requestId = 0

  async function load() {
    const rid = ++_requestId
    if (!auth.isLoggedIn) return
    loading = true
    try {
      const data = await loadHomeData(ncm, auth.user)
      if (rid !== _requestId) return
      recommendPlaylists = data.recommendPlaylists
      recentTracks = data.recentTracks
      data.weeklyPromise?.then(v => {
        if (rid !== _requestId) return
        if (v.recentTracks.length) recentTracks = v.recentTracks
      }).catch(() => {})
      data.recommendPromise?.then(v => {
        if (rid === _requestId) recommendPlaylists = v
      }).catch(() => {})
    } catch (e) { console.error(e) }
    loading = false
  }

  $effect(() => { if (auth.isLoggedIn) load() })
</script>

<div class="m-page m-home">
  <header class="m-page-header">
    <h1>主页</h1>
  </header>

  {#if !auth.isLoggedIn}
    <div class="m-empty-state">
      <Icon name="home" size={48} />
      <h2>登录查看每日推荐</h2>
      <p>登录后为你定制专属歌单与最近播放</p>
      <button class="m-primary-btn" onclick={() => onOpenLogin?.()}>立即登录</button>
    </div>
  {:else if loading && recommendPlaylists.length === 0}
    <div class="m-loading"><Spinner size="md" /></div>
  {:else}
    <!-- 日推大卡 -->
    {#if recommendPlaylists[0]}
      <section class="m-section">
        <button class="m-hero-card" onclick={() => onOpenPlaylist?.(recommendPlaylists[0].id)}>
          {#if recommendPlaylists[0].picUrl}
            <img src={coverUrl(recommendPlaylists[0].picUrl, 600)} alt="" loading="lazy" referrerpolicy="no-referrer" />
          {/if}
          <div class="m-hero-copy">
            <small>每日推荐</small>
            <strong>{recommendPlaylists[0].name}</strong>
          </div>
        </button>
      </section>
    {/if}

    <!-- 最近播放横滑 -->
    {#if recentTracks.length}
      <section class="m-section">
        <div class="m-section-head"><h2>最近播放</h2></div>
        <div class="m-rail m-rail-songs">
          {#each recentTracks.slice(0, 12) as track (track.id)}
            <button class="m-song-card" onclick={() => onOpenArtist?.(track.artistId || track.ar?.[0]?.id)}>
              <div class="m-song-cover">
                {#if track.picUrl}<img src={coverUrl(track.picUrl, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-song-title">{track.name}</strong>
              <span class="m-song-sub">{track.artistName || track.ar?.map(a => a.name).join(' / ') || '未知艺人'}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- 推荐歌单 2 列 -->
    {#if recommendPlaylists.length > 1}
      <section class="m-section">
        <div class="m-section-head"><h2>为你推荐</h2></div>
        <div class="m-grid">
          {#each recommendPlaylists.slice(1, 9) as pl (pl.id)}
            <button class="m-grid-card" onclick={() => onOpenPlaylist?.(pl.id)}>
              <div class="m-grid-cover">
                {#if pl.picUrl}<img src={coverUrl(pl.picUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-grid-title">{pl.name}</strong>
              <span class="m-grid-sub">{pl.playCountText || '歌单'}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>
