<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { ncm } from '../../api/client.js'
  import { loadMobileLibraryData } from '../../services/home.js'
  import { coverUrl } from '../../utils/image.js'
  import Spinner from '../../components/Spinner.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  let { onOpenPlaylist, onOpenLogin } = $props()

  let loading = $state(false)
  let library = $state(null)
  let _requestId = 0

  const emptyLibrary = {
    profile: null,
    stats: [],
    createdPlaylists: [],
    savedPlaylists: [],
    likedPlaylist: null,
  }

  let data = $derived(library || emptyLibrary)
  let savedPlaylists = $derived([data.likedPlaylist, ...data.savedPlaylists].filter(Boolean))
  let createdPlaylists = $derived(data.createdPlaylists || [])
  let allPlaylists = $derived([...savedPlaylists, ...createdPlaylists])

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function load() {
    const rid = ++_requestId
    loading = true
    library = null
    if (!auth.isLoggedIn) { loading = false; return }
    try {
      const nextLibrary = await loadMobileLibraryData(ncm, auth.user)
      if (rid === _requestId) library = nextLibrary
    } finally { if (rid === _requestId) loading = false }
  }

  $effect(() => { if (auth.isLoggedIn) load() })
</script>

<div class="m-page m-library">
  <header class="m-page-header">
    <h1>资料库</h1>
  </header>

  {#if !auth.isLoggedIn}
    <div class="m-empty-state">
      <Icon name="liked" size={48} />
      <h2>登录查看收藏</h2>
      <p>登录后可查看收藏的歌单、最近播放与历史日推</p>
      <button class="m-primary-btn" onclick={() => onOpenLogin?.()}>立即登录</button>
    </div>
  {:else}
    <section class="m-section">
      <div class="m-library-collection m-library-menu">
        <button class="m-library-row" onclick={() => data.likedPlaylist && onOpenPlaylist?.(data.likedPlaylist.id)}>
          <span class="m-library-row-icon liked"><Icon name="heart-filled" size={24} /></span>
          <div class="m-list-info">
            <strong>喜欢的音乐</strong>
            <span>{data.likedPlaylist?.trackCount || 0} 首歌曲</span>
          </div>
          <Icon name="chevron-right" size={18} />
        </button>
        <button class="m-library-row" onclick={() => scrollToSection('saved-playlists')}>
          <span class="m-library-row-icon"><Icon name="music-note" size={24} /></span>
          <div class="m-list-info">
            <strong>收藏的歌单</strong>
            <span>{data.savedPlaylists.length} 个歌单</span>
          </div>
          <Icon name="chevron-right" size={18} />
        </button>
        <button class="m-library-row" onclick={() => scrollToSection('created-playlists')}>
          <span class="m-library-row-icon"><Icon name="list" size={24} /></span>
          <div class="m-list-info">
            <strong>创建的歌单</strong>
            <span>{data.createdPlaylists.length} 个歌单</span>
          </div>
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
    </section>

    {#if allPlaylists.length}
      <section class="m-section">
        <div class="m-section-head"><h2>最近添加</h2></div>
        <div class="m-library-grid">
          {#each allPlaylists.slice(0, 8) as pl (pl.id)}
            <button class="m-library-added" onclick={() => onOpenPlaylist?.(pl.id)}>
              <div class="m-library-added-cover">
                {#if pl.picUrl}
                  <img src={coverUrl(pl.picUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                {:else}
                  <Icon name="music-note" size={34} />
                {/if}
              </div>
              <strong>{pl.name}</strong>
              <span>{pl.trackCount || 0} 首</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <section class="m-section" id="saved-playlists">
      <div class="m-section-head"><h2>收藏</h2></div>
      {#if loading && savedPlaylists.length === 0}
        <div class="m-loading"><Spinner size="md" /></div>
      {:else if savedPlaylists.length === 0}
        <div class="m-empty-state small">
          <p>暂无收藏歌单</p>
        </div>
      {:else}
        <div class="m-library-list">
          {#each savedPlaylists as pl (pl.id)}
            <button class="m-library-playlist-row" onclick={() => onOpenPlaylist?.(pl.id)}>
              <div class="m-library-playlist-cover">
                {#if pl.picUrl}
                  <img src={coverUrl(pl.picUrl, 220)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                {:else}
                  <Icon name="music-note" size={34} />
                {/if}
              </div>
              <div class="m-list-info">
                <strong>{pl.name}</strong>
                <span>{pl.trackCount || 0} 首</span>
              </div>
              <Icon name="chevron-right" size={18} />
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section class="m-section" id="created-playlists">
      <div class="m-section-head"><h2>创建的歌单</h2></div>
      {#if createdPlaylists.length === 0}
        <div class="m-empty-state small">
          <p>暂无创建歌单</p>
        </div>
      {:else}
        <div class="m-library-list">
          {#each createdPlaylists as pl (pl.id)}
            <button class="m-library-playlist-row" onclick={() => onOpenPlaylist?.(pl.id)}>
              <div class="m-library-playlist-cover">
                {#if pl.picUrl}
                  <img src={coverUrl(pl.picUrl, 220)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                {:else}
                  <Icon name="music-note" size={34} />
                {/if}
              </div>
              <div class="m-list-info">
                <strong>{pl.name}</strong>
                <span>{pl.trackCount || 0} 首</span>
              </div>
              <Icon name="chevron-right" size={18} />
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>
