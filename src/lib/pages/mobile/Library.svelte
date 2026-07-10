<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { ncm } from '../../api/client.js'
  import { loadMobileLibraryData } from '../../services/home.js'
  import { coverUrl } from '../../utils/image.js'
  import Spinner from '../../components/Spinner.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  let { onOpenPlaylist, onOpenLogin, onNavigate } = $props()

  let loading = $state(false)
  let applyingId = $state(null)
  let creating = $state(false)
  let notice = $state('')
  let sheet = $state(null)
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
  let savedPlaylists = $derived(data.savedPlaylists || [])
  let createdPlaylists = $derived(data.createdPlaylists || [])
  let historyPlaylist = $derived(data.createdPlaylists.find(pl => /历史|history|最近/i.test(pl.name)) || null)

  async function load(reset = true) {
    const rid = ++_requestId
    loading = true
    if (reset) library = null
    if (!auth.isLoggedIn) { loading = false; return }
    try {
      const nextLibrary = await loadMobileLibraryData(ncm, auth.user, { refresh: true })
      if (rid === _requestId) library = nextLibrary
    } finally { if (rid === _requestId) loading = false }
  }

  function resultError(result, fallback) {
    if (!result || result.code === 200) return ''
    return result.message || result.msg || fallback
  }

  function addCreatedPlaylist(playlist) {
    if (!playlist?.id) return
    const nextPlaylist = {
      id: playlist.id,
      name: playlist.name || '新歌单',
      picUrl: playlist.picUrl || playlist.coverImgUrl || '',
      trackCount: playlist.trackCount || 0,
      playCount: playlist.playCount || 0,
      creator: playlist.creator,
    }
    const current = library || emptyLibrary
    library = {
      ...current,
      createdPlaylists: [nextPlaylist, ...(current.createdPlaylists || []).filter(pl => pl.id !== nextPlaylist.id)],
    }
  }

  function removeCreatedPlaylist(id) {
    if (!id || !library) return
    library = {
      ...library,
      createdPlaylists: (library.createdPlaylists || []).filter(pl => pl.id !== id),
    }
  }

  function showNotice(text) {
    notice = text
    window.setTimeout(() => { if (notice === text) notice = '' }, 1800)
  }

  function openCreateSheet() {
    sheet = { type: 'create', title: '新建歌单', label: '歌单名称', value: '' }
  }

  function openSubscribeSheet() {
    sheet = { type: 'subscribe', title: '收藏歌单', label: '歌单 ID', value: '' }
  }

  function openConfirmSheet(type, playlist) {
    sheet = { type, playlist, title: type === 'delete' ? '删除歌单' : '取消收藏', value: playlist?.name || '' }
  }

  function closeSheet() {
    sheet = null
  }

  async function submitSheet() {
    const current = sheet
    if (!current) return
    if (current.type === 'create') await createPlaylist(current.value)
    else if (current.type === 'subscribe') await subscribePlaylist(current.value)
    else if (current.type === 'unsubscribe') await unsubscribePlaylist(current.playlist)
    else if (current.type === 'delete') await deletePlaylist(current.playlist)
  }

  async function createPlaylist(nameInput) {
    if (creating) return
    const name = nameInput?.trim()
    if (!name) return
    creating = true
    try {
      const result = await ncm.playlistCreate(name)
      const error = resultError(result, '创建失败')
      if (error) throw new Error(error)
      closeSheet()
      addCreatedPlaylist(result.playlist || result.data?.playlist)
      showNotice('已创建歌单')
    } catch (error) {
      showNotice(error?.message || '创建失败')
    } finally {
      creating = false
    }
  }

  async function unsubscribePlaylist(playlist) {
    if (!playlist?.id || applyingId) return
    applyingId = playlist.id
    try {
      const result = await ncm.playlistSubscribe(playlist.id, false)
      const error = resultError(result, '操作失败')
      if (error) throw new Error(error)
      closeSheet()
      showNotice('已取消收藏')
      await load()
    } catch (error) {
      showNotice(error?.message || '操作失败')
    } finally {
      applyingId = null
    }
  }

  async function subscribePlaylist(idInput) {
    if (applyingId) return
    const id = idInput?.trim()
    if (!id) return
    applyingId = id
    try {
      const result = await ncm.playlistSubscribe(id, true)
      const error = resultError(result, '收藏失败')
      if (error) throw new Error(error)
      closeSheet()
      showNotice('已收藏歌单')
      await load()
    } catch (error) {
      showNotice(error?.message || '收藏失败')
    } finally {
      applyingId = null
    }
  }

  async function deletePlaylist(playlist) {
    if (!playlist?.id || applyingId) return
    applyingId = playlist.id
    try {
      const result = await ncm.playlistDelete(playlist.id)
      const error = resultError(result, '删除失败')
      if (error) throw new Error(error)
      closeSheet()
      removeCreatedPlaylist(playlist.id)
      showNotice('已删除歌单')
    } catch (error) {
      showNotice(error?.message || '删除失败')
    } finally {
      applyingId = null
    }
  }

  $effect(() => { if (auth.isLoggedIn) load() })
</script>

<div class="m-page m-library">
  <header class="m-page-header">
    <div>
      <span class="m-page-kicker">Library</span>
      <h1>歌单</h1>
    </div>
  </header>

  {#if !auth.isLoggedIn}
    <div class="m-empty-state">
      <Icon name="liked" size={48} />
      <h2>登录查看收藏</h2>
      <p>登录后可查看收藏的歌单、最近播放与历史日推</p>
      <button class="m-primary-btn" onclick={() => onOpenLogin?.()}>立即登录</button>
    </div>
  {:else}
    {#if notice}<div class="m-library-notice">{notice}</div>{/if}

    <section class="m-section">
      <div class="m-library-card-grid m-library-card-grid-featured">
        <button class="m-library-card m-library-card-liked" onclick={() => data.likedPlaylist && onOpenPlaylist?.(data.likedPlaylist.id)} disabled={!data.likedPlaylist}>
          <span class="m-library-card-cover"><Icon name="heart-filled" size={34} /></span>
          <strong>红心歌单</strong>
          <span>{data.likedPlaylist?.trackCount || 0} 首歌曲</span>
        </button>
        <button class="m-library-card" onclick={() => onNavigate?.('recent')}>
          <span class="m-library-card-cover"><Icon name="clock" size={34} /></span>
          <strong>历史记录歌单</strong>
          <span>{historyPlaylist ? `${historyPlaylist.trackCount || 0} 首` : '最近播放'}</span>
        </button>
      </div>
    </section>

    <section class="m-section" id="saved-playlists">
      <div class="m-section-head">
        <h2>我收藏的歌单</h2>
        <button class="m-section-action" type="button" onclick={openSubscribeSheet} disabled={!!applyingId}>收藏</button>
      </div>
      {#if loading && savedPlaylists.length === 0}
        <div class="m-loading"><Spinner size="md" /></div>
      {:else if savedPlaylists.length === 0}
        <div class="m-empty-state small">
          <p>暂无收藏歌单</p>
        </div>
      {:else}
        <div class="m-library-card-grid">
          {#each savedPlaylists as pl (pl.id)}
            <div class="m-library-card">
              <button class="m-library-card-main" type="button" onclick={() => onOpenPlaylist?.(pl.id)}>
                <span class="m-library-card-cover">
                  {#if pl.picUrl}
                    <img src={coverUrl(pl.picUrl, 220)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <Icon name="music-note" size={34} />
                  {/if}
                </span>
                <strong>{pl.name}</strong>
                <span>{pl.trackCount || 0} 首</span>
              </button>
              <button class="m-library-card-menu" type="button" onclick={() => openConfirmSheet('unsubscribe', pl)} disabled={applyingId === pl.id} aria-label={`取消收藏 ${pl.name}`}>×</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="m-section" id="created-playlists">
      <div class="m-section-head">
        <h2>创建的歌单</h2>
      </div>
      <div class="m-library-card-grid">
        {#each createdPlaylists as pl (pl.id)}
          <div class="m-library-card">
            <button class="m-library-card-main" type="button" onclick={() => onOpenPlaylist?.(pl.id)}>
              <span class="m-library-card-cover">
              {#if pl.picUrl}
                <img src={coverUrl(pl.picUrl, 220)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {:else}
                <Icon name="music-note" size={34} />
              {/if}
              </span>
              <strong>{pl.name}</strong>
              <span>{pl.trackCount || 0} 首</span>
            </button>
            <button class="m-library-action danger" type="button" onclick={() => openConfirmSheet('delete', pl)} disabled={applyingId === pl.id}>删除</button>
          </div>
        {/each}
        <button class="m-library-card m-library-card-add" type="button" onclick={openCreateSheet} disabled={creating} aria-label="创建歌单">
          <span class="m-library-card-cover"><Icon name="plus" size={34} /></span>
          <strong>创建歌单</strong>
          <span>新歌单</span>
        </button>
      </div>
    </section>

    {#if sheet}
      <div class="m-library-sheet-backdrop" role="presentation" onclick={closeSheet}></div>
      <form class="m-library-sheet" onsubmit={(event) => { event.preventDefault(); submitSheet() }}>
        <h2>{sheet.title}</h2>
        {#if sheet.type === 'create' || sheet.type === 'subscribe'}
          <label>
            <span>{sheet.label}</span>
            <input bind:value={sheet.value} />
          </label>
        {:else}
          <p>{sheet.type === 'delete' ? '确定删除这个歌单吗？' : '确定取消收藏这个歌单吗？'}</p>
          <strong>{sheet.playlist?.name}</strong>
        {/if}
        <div class="m-library-sheet-actions">
          <button type="button" onclick={closeSheet}>取消</button>
          <button class:danger={sheet.type === 'delete'} type="submit" disabled={creating || !!applyingId}>{creating || !!applyingId ? '处理中' : sheet.type === 'delete' ? '删除' : '确定'}</button>
        </div>
      </form>
    {/if}
  {/if}
</div>
