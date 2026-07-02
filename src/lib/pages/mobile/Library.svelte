<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { ncm } from '../../api/client.js'
  import { loadLibraryData } from '../../services/home.js'
  import { coverUrl } from '../../utils/image.js'
  import Spinner from '../../components/Spinner.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  let { onOpenPlaylist, onOpenLogin, onNavigate } = $props()

  let loading = $state(false)
  let playlists = $state([])
  let _requestId = 0

  async function load() {
    const rid = ++_requestId
    loading = true
    playlists = []
    if (!auth.isLoggedIn) { loading = false; return }
    try {
      const p = await loadLibraryData(ncm, auth.user)
      if (rid === _requestId) playlists = p
    } finally { if (rid === _requestId) loading = false }
  }

  $effect(() => { if (auth.isLoggedIn) load() })
</script>

<div class="m-page m-library">
  <header class="m-page-header">
    <h1>我的</h1>
  </header>

  {#if !auth.isLoggedIn}
    <div class="m-empty-state">
      <Icon name="liked" size={48} />
      <h2>登录查看收藏</h2>
      <p>登录后可查看收藏的歌单、最近播放与历史日推</p>
      <button class="m-primary-btn" onclick={() => onOpenLogin?.()}>立即登录</button>
    </div>
  {:else}
    <!-- 快速入口 -->
    <section class="m-section">
      <div class="m-quick-grid">
        <button class="m-quick-tile m-quick-tile--liked" onclick={() => onNavigate?.('liked')}>
          <Icon name="heart-filled" size={28} />
          <span>我喜欢的音乐</span>
        </button>
        <button class="m-quick-tile" onclick={() => onNavigate?.('recent')}>
          <Icon name="clock" size={28} />
          <span>最近播放</span>
        </button>
        <button class="m-quick-tile" onclick={() => onNavigate?.('dailyHistory')}>
          <Icon name="calendar" size={28} />
          <span>历史日推</span>
        </button>
        <button class="m-quick-tile" onclick={() => onOpenPlaylist?.(0)}>
          <Icon name="music-note" size={28} />
          <span>我的收藏</span>
        </button>
      </div>
    </section>

    <!-- 歌单列表 -->
    <section class="m-section">
      <div class="m-section-head"><h2>收藏歌单</h2></div>
      {#if loading && playlists.length === 0}
        <div class="m-loading"><Spinner size="md" /></div>
      {:else if playlists.length === 0}
        <div class="m-empty-state small">
          <p>暂无收藏歌单</p>
        </div>
      {:else}
        <div class="m-list">
          {#each playlists as pl (pl.id)}
            <button class="m-list-item" onclick={() => onOpenPlaylist?.(pl.id)}>
              <div class="m-list-cover">
                {#if pl.picUrl}<img src={coverUrl(pl.picUrl, 120)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <div class="m-list-info">
                <strong>{pl.name}</strong>
                <span>{pl.trackCount || 0} 首 · {pl.playCountText || '歌单'}</span>
              </div>
              <Icon name="chevron-right" size={18} />
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>
