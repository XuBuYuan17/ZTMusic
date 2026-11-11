<script module lang="ts">
  let librarySnapshot: { userId: unknown; library: unknown; likedCovers: string[] } | null = null
  let libraryReturn: { userId: unknown; group: string; playlistId: string; scrollTop: number } | null = null
</script>

<script lang="ts">
  import type { SongId } from '../../types/music.ts'
  import type { NormalizedPlaylist } from '../../utils/normalize.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import { normalizePlaylist } from '../../utils/normalize.ts'
  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'
  import ConfirmDialog from '../../components/ConfirmDialog.svelte'
  import CreatePlaylistModal from '../../components/CreatePlaylistModal.svelte'
  import PlaylistEditModal from '../../components/PlaylistEditModal.svelte'
  import PlaylistGroupPicker from '../../components/PlaylistGroupPicker.svelte'
  import { PLAYLIST_CHANGE, notifyPlaylistChange, router } from '../../stores/router.svelte.ts'
  import { onDestroy, onMount, tick } from 'svelte'
  import { getScrollViewport } from '../../app/scroll-viewport.ts'
  import { isTouchDevice, responsive } from '../../utils/responsive.ts'
  import Icon from '../../components/ui/Icon.svelte'
  import PlaylistActionSheet, { queuePlaylist, sharePlaylist, playlistPortal, type PlaylistAction } from '../../components/PlaylistActionSheet.svelte'
  import LikedCoverFalls from '../../components/LikedCoverFalls.svelte'
  import RecentTracksModule from '../../components/RecentTracksModule.svelte'
  import { libraryPlaylistActions, runLibraryPlaylistAction } from '../../components/library-playlist-actions.ts'
  import { coverUrl } from '../../utils/image.ts'
  import { formatPlayCount } from '../../format.ts'
  import { reducedMotion, flyReturnCover } from '../../app/desktop-motion.ts'
  import { mobileLongPress } from '../../app/mobile-interaction.ts'
  import { readPlaylistGroups, PLAYLIST_GROUPS_CHANGE, type PlaylistGroup } from '../../services/playlist-groups.ts'
  import { loadLibraryPlaylists } from '../../services/library-playlists.ts'

  interface LibraryData {
    stats: { follow: number | null; fans: number | null; playlist: number | null }
    createdPlaylists: NormalizedPlaylist[]
    savedPlaylists: NormalizedPlaylist[]
    likedPlaylist: NormalizedPlaylist | null
    /** 资料概览用的最小身份信息；预告/周排行为空，由主页负责 */
    profile: { nickname: string; avatarUrl: string; backgroundUrl: string; identityLabel: string; signature: string; level: number | null; listenSongs: number | null }
  }
  interface RawPlaylist {
    specialType?: number
    creator?: { userId?: SongId } | null
  }
  type SafeTimer = ReturnType<typeof setTimeout>

  let { onOpenLogin, onOpenPlaylist, onNavigate }: {
    onOpenLogin?: () => void
    onOpenPlaylist?: (id: SongId, push?: boolean, preview?: unknown) => void
    onNavigate?: (view: string) => void
  } = $props()

  const initial = librarySnapshot?.userId === auth.user?.userId ? librarySnapshot : null
  let library = $state<LibraryData | null>((initial?.library as LibraryData | undefined) ?? null)
  let loading = $state(false)
  let error = $state('')
  let _requestId = 0
  let ownerId = initial?.userId ?? null
  const returning = router.routeTransition === 'back' && router.previousView === 'playlist' && libraryReturn?.userId === auth.user?.userId ? libraryReturn : null
  let expandedCollection = $state<string | null>(returning?.group ?? null)
  const scrollViewport = getScrollViewport()
  onMount(() => {
    if (!returning || scrollViewport?.restoresScroll) return
    const frame = requestAnimationFrame(() => {
      const viewport = scrollViewport?.element()
      if (viewport) viewport.scrollTop = returning.scrollTop
      flyReturnCover(collectionRoot?.querySelector<HTMLImageElement>('img[data-shared-cover-return="true"]') ?? null)
    })
    return () => cancelAnimationFrame(frame)
  })
  let customGroups = $state<PlaylistGroup[]>([])
  let groupLoadError = $state('')
  let collectionRoot = $state<HTMLElement | null>(null)
  let collectionAnimations: Animation[] = []
  let collectionMotionVersion = 0
  function cancelCollectionMotion(): void {
    collectionMotionVersion++
    collectionAnimations.forEach(animation => animation.cancel())
    collectionAnimations = []
  }
  async function setExpandedCollection(id: string | null): Promise<void> {
    const affected = new Set([expandedCollection, id].filter((value): value is string => value !== null))
    const covers = [...(collectionRoot?.querySelectorAll<HTMLElement>('.collection-group') ?? [])]
      .filter(group => group.dataset.groupId && affected.has(group.dataset.groupId))
      .flatMap(group => [...group.querySelectorAll<HTMLElement>('.collection-item__cover')].slice(0, 3))
    const before = new Map(covers.filter(node => getComputedStyle(node).visibility !== 'hidden').map(node => {
      const rect = node.getBoundingClientRect()
      const transform = getComputedStyle(node).transform
      const match = transform.match(/^matrix\(\s*([^,]+),\s*([^,]+)/)
      const angle = match ? Math.atan2(Number(match[2]), Number(match[1])) : 0
      const rotatedWidth = Math.abs(Math.cos(angle)) * node.offsetWidth + Math.abs(Math.sin(angle)) * node.offsetHeight
      return [node, { rect, angle, width: rotatedWidth ? node.offsetWidth * rect.width / rotatedWidth : 0 }]
    }))
    cancelCollectionMotion()
    const version = collectionMotionVersion
    expandedCollection = id
    await tick()
    if (version !== collectionMotionVersion || reducedMotion()) return
    for (const [node, source] of before) {
      if (!node.isConnected || getComputedStyle(node).visibility === 'hidden') continue
      const target = node.getBoundingClientRect()
      if (!source.width || !target.width || !target.height) continue
      const transform = getComputedStyle(node).transform
      const match = transform.match(/^matrix\(\s*([^,]+),\s*([^,]+)/)
      const targetAngle = match ? Math.atan2(Number(match[2]), Number(match[1])) : 0
      const rotatedWidth = Math.abs(Math.cos(targetAngle)) * node.offsetWidth + Math.abs(Math.sin(targetAngle)) * node.offsetHeight
      const targetWidth = rotatedWidth ? node.offsetWidth * target.width / rotatedWidth : 0
      if (!targetWidth) continue
      const x = source.rect.left + source.rect.width / 2 - target.left - target.width / 2
      const y = source.rect.top + source.rect.height / 2 - target.top - target.height / 2
      const scale = source.width / targetWidth
      const index = Number(node.closest<HTMLElement>('.collection-item')?.dataset.index ?? 0)
      try {
        const animation = node.animate([
          { transform: `translate(${x}px, ${y}px) rotate(${source.angle}rad) scale(${scale})` },
          { transform: `translate(0, 0) rotate(${targetAngle}rad) scale(1)` },
        ], { duration: 400, delay: Math.min(index, 3) * 35, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'backwards' })
        collectionAnimations.push(animation)
      } catch (error) { console.warn('[collection] 封面过渡不可用', error) }
    }
  }
  function dismissPlaylistManager(): void { void setExpandedCollection(null) }
  function openCollection(id: string): void { void setExpandedCollection(expandedCollection === id ? null : id) }
  function openGroupPlaylist(pl: NormalizedPlaylist): void {
    if (expandedCollection) libraryReturn = { userId: auth.user?.userId, group: expandedCollection, playlistId: String(pl.id), scrollTop: scrollViewport?.element()?.scrollTop ?? 0 }
    onOpenPlaylist?.(pl.id as SongId, true, pl)
  }
  onDestroy(cancelCollectionMotion)
  function dismissOnOutside(event: MouseEvent): void {
    if (router.activeView !== 'library' || !expandedCollection || !(event.target instanceof Element)) return
    if (event.target.closest('.collection-item, .library-options-portal, .library-management-portal, [role="dialog"], button, a, input, select, textarea, [role="button"]')) return
    dismissPlaylistManager()
  }
  function dismissOnEscape(event: KeyboardEvent): void {
    if (router.activeView === 'library' && event.key === 'Escape' && expandedCollection && !optionsTarget && !showCreateModal && !editTarget && !groupTarget && !deleteTarget && !unsubscribeTarget) dismissPlaylistManager()
  }
  function refreshGroups(): void {
    if (!auth.user?.userId) { customGroups = []; groupLoadError = ''; return }
    try { customGroups = readPlaylistGroups(auth.user.userId); groupLoadError = '' }
    catch (error) { customGroups = []; groupLoadError = error instanceof Error ? error.message : '读取分组失败' }
  }
  $effect(() => {
    auth.user?.userId
    refreshGroups()
    window.addEventListener(PLAYLIST_GROUPS_CHANGE, refreshGroups)
    return () => window.removeEventListener(PLAYLIST_GROUPS_CHANGE, refreshGroups)
  })

  // 创建歌单
  let showCreateModal = $state(false)

  // 取消收藏确认
  let unsubscribeTarget = $state<NormalizedPlaylist | null>(null)
  let unsubscribing = $state(false)

  // 自建歌单：编辑 / 删除
  let editTarget = $state<NormalizedPlaylist | null>(null)
  let groupTarget = $state<NormalizedPlaylist | null>(null)
  let deleteTarget = $state<NormalizedPlaylist | null>(null)
  let deleting = $state(false)
  type PlaylistKind = 'liked' | 'owned' | 'saved'
  let optionsTarget = $state<{ pl: NormalizedPlaylist; kind: PlaylistKind } | null>(null)
  let optionsClosing = $state(false)
  let optionsOrigin: HTMLElement | null = null
  let pendingAction: (() => void) | null = null
  function openOptions(pl: NormalizedPlaylist, kind: PlaylistKind, origin: HTMLElement) {
    optionsClosing = false
    optionsOrigin = origin
    pendingAction = null
    optionsTarget = { pl, kind }
  }
  function groupLongPress(node: HTMLElement, item: { pl: NormalizedPlaylist; kind: 'owned' | 'saved' }) {
    let current = item
    const action = mobileLongPress(node, { enabled: () => isTouchDevice(), open: () => openOptions(current.pl, current.kind, node) })
    return { update(next: typeof item) { current = next }, destroy() { action.destroy() } }
  }
  function closeOptions(action: (() => void) | null = null) { pendingAction = action; if (optionsTarget) optionsClosing = true }
  function finishOptions() {
    optionsTarget = null
    const action = pendingAction
    pendingAction = null
    if (action) tick().then(() => { optionsOrigin?.focus({ preventScroll: true }); action() })
  }
  $effect(() => { if (!auth.isLoggedIn) closeOptions() })

  // 轻提示
  let notice = $state('')

  const emptyLibrary: LibraryData = {
    stats: { follow: null, fans: null, playlist: null },
    createdPlaylists: [],
    savedPlaylists: [],
    likedPlaylist: null,
    profile: { nickname: '', avatarUrl: '', backgroundUrl: '', identityLabel: '', signature: '', level: null, listenSongs: null },
  }

  let data = $derived(library || emptyLibrary)
  let savedPlaylists = $derived(data.savedPlaylists || [])
  let createdPlaylists = $derived(data.createdPlaylists || [])
  let likedPlaylist = $derived(data.likedPlaylist)
  // “我喜欢的音乐”同时出现在 savedPlaylists 里，网格首位单独渲染后排除
  let otherSavedPlaylists = $derived(
    likedPlaylist ? savedPlaylists.filter(p => p.id !== likedPlaylist.id) : savedPlaylists,
  )
  const allGroupPlaylists = $derived([...createdPlaylists.map(pl => ({ pl, kind: 'owned' as const })), ...otherSavedPlaylists.map(pl => ({ pl, kind: 'saved' as const }))])
  const collectionGroups = $derived([
    { id: 'owned', title: '我创建的', items: allGroupPlaylists.filter(item => item.kind === 'owned') },
    { id: 'saved', title: '我收藏的', items: allGroupPlaylists.filter(item => item.kind === 'saved') },
    ...customGroups.map(group => ({ id: `custom:${group.id}`, title: group.name, items: allGroupPlaylists.filter(item => group.playlistIds.includes(String(item.pl.id))) })),
  ])
  const displayGroups = $derived([...collectionGroups].sort((a, b) => Number(b.id === expandedCollection) - Number(a.id === expandedCollection)))

  // 喜爱歌曲卡封面瀑布流：只取前 8 首的封面
  let likedCovers = $state<string[]>(initial?.likedCovers ?? [])

  function save(): void {
    librarySnapshot = { userId: auth.user?.userId, library, likedCovers: [...likedCovers] }
  }

  async function loadLikedCovers(liked: NormalizedPlaylist | null, rid: number): Promise<void> {
    const id = liked?.id
    if (!id) { likedCovers = []; return }
    try {
      const res = await ncm.playlistTracks(id as SongId, 8, 0)
      if (rid !== _requestId) return
      const r = rec(res)
      const songs = Array.isArray(r?.songs) ? r.songs : []
      likedCovers = songs.map((s) => {
        const x = rec(s)
        const pic = rec(x?.al)?.picUrl ?? rec(x?.album)?.picUrl
        return typeof pic === 'string' ? pic : ''
      }).filter(Boolean)
      save()
    } catch {
      // 拉不到就回退灰底红星
    }
  }


  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }

  function count(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  function displayCount(value: number | null | undefined): string {
    return value == null ? '—' : formatPlayCount(value) || '0'
  }

  function isOwnPlaylist(p: unknown, uid: SongId): boolean {
    const r = rec(p) as RawPlaylist | null
    return String(r?.creator?.userId ?? '') === String(uid) && r?.specialType !== 5
  }

  async function load(): Promise<void> {
    const rid = ++_requestId; loading = true; error = ''
    if (!auth.isLoggedIn) { loading = false; library = null; return }
    try {
      const rawUid: unknown = auth.user?.userId || auth.user?.id
      const uid: SongId = typeof rawUid === 'number' || typeof rawUid === 'string' ? rawUid : 0
      const owner: unknown = rawUid
      const [all, subRes, detailRes] = await Promise.all([
        loadLibraryPlaylists(ncm.userPlaylist, uid, () => rid === _requestId && (auth.user?.userId || auth.user?.id) === owner),
        ncm.userSubcount().catch(() => ({})),
        ncm.userDetail(uid).catch(() => ({})),
      ])
      // 请求期间换号时，过期结果不得写进新账号的状态与快照
      if (rid !== _requestId || (auth.user?.userId || auth.user?.id) !== owner) return

      const saved = all.filter(p => !isOwnPlaylist(p, uid)).map(normalizePlaylist).filter((p): p is NormalizedPlaylist => p !== null)
      const created = all.filter(p => isOwnPlaylist(p, uid)).map(normalizePlaylist).filter((p): p is NormalizedPlaylist => p !== null)
      const liked = normalizePlaylist(all.find(p => {
        const r = rec(p) as RawPlaylist | null
        return String(r?.creator?.userId ?? '') === String(uid) && r?.specialType === 5
      }))

      const subR = rec(subRes)
      const sub = rec(subR?.data) || subR || {}
      const detailR = rec(detailRes)
      const detail = rec(detailR?.data) || detailR || {}
      const profile = rec(detail.profile) || {}
      const identify = rec(detailR?.identify) || rec(detail.identify) || {}
      const mainAuth = rec(profile.mainAuthType) || {}
      const createdCount = count(sub.createdPlaylistCount)
      const savedCount = count(sub.subPlaylistCount)

      library = {
        stats: {
          follow: count(profile.follows ?? detail.follows ?? sub.followCount),
          fans: count(profile.followeds ?? detail.followeds ?? sub.followedCount),
          playlist: createdCount !== null && savedCount !== null ? createdCount + savedCount : count(profile.playlistCount ?? detail.playlistCount),
        },
        createdPlaylists: created,
        savedPlaylists: saved,
        likedPlaylist: liked,
        profile: {
          nickname: String(profile.nickname ?? auth.user?.nickname ?? ''),
          avatarUrl: String(profile.avatarUrl ?? auth.user?.avatarUrl ?? ''),
          backgroundUrl: String(profile.backgroundUrl ?? profile.backgroundImageUrl ?? ''),
          identityLabel: String(mainAuth.desc ?? identify.imageDesc ?? profile.detailDescription ?? ''),
          signature: String(profile.signature ?? ''),
          level: count(detail.level ?? profile.level),
          listenSongs: count(detail.listenSongs ?? profile.listenSongs),
        },
      }
      save()
      void loadLikedCovers(liked, rid)
    } catch (e) {
      if (rid === _requestId) error = ((e as { message?: unknown } | null | undefined)?.message || '加载失败') as string
    } finally {
      if (rid === _requestId) loading = false
    }
  }

  const timers = new Set<SafeTimer>()
  function safeTimeout(fn: () => void, ms: number): SafeTimer {
    const id = setTimeout(() => { timers.delete(id); fn() }, ms)
    timers.add(id)
    return id
  }

  function showNotice(text: string): void {
    notice = text
    safeTimeout(() => { if (notice === text) notice = '' }, 1800)
  }

  function confirmUnsubscribe(pl: NormalizedPlaylist): void {
    unsubscribeTarget = pl
  }

  function closeUnsubscribe(): void {
    if (unsubscribing) return
    unsubscribeTarget = null
  }

  async function submitUnsubscribe(): Promise<void> {
    const pl = unsubscribeTarget
    if (!pl?.id || unsubscribing) return
    unsubscribing = true
    try {
      const result = await runLibraryPlaylistAction('unsubscribe', pl.id as SongId, ncm)
      // 失败时不关弹窗、不动列表，只提示
      if (!result.ok) { showNotice(result.message); return }
      unsubscribeTarget = null
      showNotice(result.message)
      notifyPlaylistChange(pl.id as SongId)
    } finally {
      unsubscribing = false
    }
  }

  function confirmDelete(pl: NormalizedPlaylist): void {
    deleteTarget = pl
  }

  function closeDelete(): void {
    if (deleting) return
    deleteTarget = null
  }

  async function submitDelete(): Promise<void> {
    const pl = deleteTarget
    if (!pl?.id || deleting) return
    deleting = true
    try {
      const result = await runLibraryPlaylistAction('delete', pl.id as SongId, ncm)
      if (!result.ok) { showNotice(result.message); return }
      deleteTarget = null
      showNotice(result.message)
      notifyPlaylistChange(pl.id as SongId)
    } finally {
      deleting = false
    }
  }

  $effect(() => {
    const uid = auth.user?.userId ?? null
    if (!auth.isLoggedIn || uid !== ownerId) {
      _requestId++; library = null; likedCovers = []; ownerId = uid
      libraryReturn = null
      dismissPlaylistManager(); closeOptions(); showCreateModal = false; editTarget = null; groupTarget = null; deleteTarget = null; unsubscribeTarget = null
    }
    if (auth.isLoggedIn && uid) { void load() }
    // 歌单在别处被改名 / 删除 / 取消收藏时跟着刷新。不监听的话这份列表会一直拿着旧名字
    const reload = () => { void load() }
    window.addEventListener(PLAYLIST_CHANGE, reload)
    return () => {
      _requestId++
      window.removeEventListener(PLAYLIST_CHANGE, reload)
      timers.forEach(id => clearTimeout(id))
    }
  })
</script>

<svelte:window onclick={dismissOnOutside} onkeydown={dismissOnEscape} />

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
    {#if notice}<div class="library-notice" role="status">{notice}</div>{/if}

    <div class="library-unified">
      <header class="library-identity">
        {#if data.profile.backgroundUrl}<div class="library-identity__background" aria-hidden="true" style={`background-image: url(${JSON.stringify(coverUrl(data.profile.backgroundUrl, 800))})`}></div>{/if}
        <div class="library-identity__person">
          {#if data.profile.avatarUrl || auth.user?.avatarUrl}
            <img src={coverUrl(data.profile.avatarUrl || String(auth.user?.avatarUrl), 160)} alt="" referrerpolicy="no-referrer" />
          {:else}<span class="library-identity__avatar"><Icon name="user" size={28} /></span>{/if}
          <div><div class="library-identity__name"><h1>{data.profile.nickname || auth.user?.nickname || '我的资料库'}</h1>{#if data.profile.level && data.profile.level > 0}<span>Lv.{data.profile.level}</span>{/if}{#if data.profile.identityLabel}<span class="library-identity__role">{data.profile.identityLabel}</span>{/if}</div><p>{data.profile.signature || '你的音乐，都在这里'}</p><div class="library-identity__social"><span>关注 <strong>{displayCount(data.stats.follow)}</strong></span><span>粉丝 <strong>{displayCount(data.stats.fans)}</strong></span></div></div>
        </div>
        <div class="library-identity__stats" aria-label="账号数据">
          <div><strong>{displayCount(data.profile.listenSongs)}</strong><span>累计听歌</span></div>
          <div><strong>{likedPlaylist ? displayCount(likedPlaylist.trackCount) : '—'}</strong><span>喜欢歌曲</span></div>
          <div><strong>{library ? displayCount(createdPlaylists.length) : '—'}</strong><span>创建歌单</span></div>
          <div><strong>{library ? displayCount(otherSavedPlaylists.length) : '—'}</strong><span>收藏歌单</span></div>
        </div>
      </header>

      <div class="library-highlights">
        <div class="library-favorite">
          <div class="library-favorite__art" aria-hidden="true"><LikedCoverFalls covers={likedCovers} threeColumns /></div>
          <button class="library-favorite__open" type="button" onclick={() => likedPlaylist ? onOpenPlaylist?.(likedPlaylist.id as SongId, true, likedPlaylist) : onNavigate?.('liked')}>
            <span>YOUR FAVORITES</span><strong>我喜欢的音乐</strong><em>{likedPlaylist?.trackCount ?? 0} 首歌曲</em>
          </button>
        </div>
        <div class="library-activity">
          <RecentTracksModule limit={$responsive.isMobile ? 3 : 4} onOpenAll={() => onNavigate?.('recent')} />
        </div>
        <div class="library-shortcuts" aria-label="音乐记录">
            <button class="library-shortcut library-shortcut--daily" type="button" onclick={() => onNavigate?.('dailyHistory')}>
              <span class="library-shortcut__icon" aria-hidden="true"><Icon name="calendar" size={20} fill="none" strokeWidth={1.5} /></span>
              <span class="library-shortcut__copy"><strong>历史日推</strong><em>回看每日推荐</em></span>
              <span class="library-shortcut__arrow" aria-hidden="true"><Icon name="chevron-right" size={16} fill="none" /></span>
            </button>
            <button class="library-shortcut library-shortcut--stats" type="button" onclick={() => onNavigate?.('listeningStats')}>
              <span class="library-shortcut__icon" aria-hidden="true"><Icon name="music" size={20} fill="none" strokeWidth={1.5} /></span>
              <span class="library-shortcut__copy"><strong>听歌统计</strong><em>查看聆听报告</em></span>
              <span class="library-shortcut__arrow" aria-hidden="true"><Icon name="chevron-right" size={16} fill="none" /></span>
            </button>
        </div>
      </div>

      <section class="library-playlists" aria-label="我的歌单">
        <div class="library-playlists__heading"><div><span class="library-eyebrow">YOUR COLLECTION</span><h2>我的歌单</h2></div><button type="button" class="library-create" onclick={() => showCreateModal = true}><Icon name="add" size={18} />创建歌单</button></div>
        {#if error && !library}<ErrorBlock message={error} onRetry={load} />
        {:else if loading && !library}<p class="library-section-empty">正在整理歌单…</p>
        {:else}
          {#if error}<div class="collection-error" role="alert">歌单更新失败，仍显示上次的数据：{error} <button type="button" onclick={() => void load()}>重试</button></div>{/if}
          {#if groupLoadError}<p class="collection-error" role="alert">{groupLoadError}</p>{/if}
          <div class="collection-groups" bind:this={collectionRoot}>
            {#each displayGroups as group (group.id)}
              {@const expanded = expandedCollection === group.id}
              <section class="collection-group" class:expanded data-group-id={group.id} aria-label={group.title}>
                {#if expanded}
                  <header class="collection-group__header"><div><strong>{group.title}</strong><span>{group.items.length} 张歌单</span></div><button type="button" aria-label={`收起${group.title}分组`} aria-expanded="true" onclick={() => openCollection(group.id)}><Icon name="chevron-right" size={16} />收起歌单</button></header>
                {/if}
                <div class="collection-group__grid">
                  {#each (expanded ? group.items : group.items.slice(0, 3)) as item, i (item.pl.id as SongId)}
                    <div class="collection-item" data-index={i} data-playlist-id={String(item.pl.id)} inert={!expanded} style={`--cover-offset:${(i - (Math.min(group.items.length, 3) - 1) / 2) * 30}px; --cover-offset-mobile:${(i - (Math.min(group.items.length, 3) - 1) / 2) * 12}px; --cover-angle:${(i - (Math.min(group.items.length, 3) - 1) / 2) * 8}deg`}>
                      <div class="collection-item__open" data-motion="card" role="button" tabindex="0" aria-label={`打开歌单 ${item.pl.name}`} aria-haspopup="dialog" use:groupLongPress={item}
                        onclick={() => openGroupPlaylist(item.pl)}
                        oncontextmenu={(event) => { event.preventDefault(); openOptions(item.pl, item.kind, event.currentTarget) }}
                        onkeydown={(event) => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); openOptions(item.pl, item.kind, event.currentTarget) } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openGroupPlaylist(item.pl) } }}>
                        <span class="collection-item__cover">{#if item.pl.picUrl}<img src={coverUrl(item.pl.picUrl, 300)} alt="" data-shared-cover-return={returning?.group === group.id && returning?.playlistId === String(item.pl.id) ? 'true' : undefined} loading="lazy" referrerpolicy="no-referrer" onerror={(event) => { (event.currentTarget as HTMLImageElement).hidden = true }} />{:else}<Icon name="music" size={28} />{/if}</span>
                        <span class="collection-item__info"><strong>{item.pl.name}</strong><small>{item.pl.trackCount ?? 0} 首</small></span>
                      </div>
                      <button class="collection-item__menu" type="button" title="歌单管理" aria-label={`更多操作 ${item.pl.name}`} onclick={(event) => openOptions(item.pl, item.kind, event.currentTarget)}><Icon name="more" size={18} aria-hidden="true" /></button>
                    </div>
                  {:else}<p class="collection-group__message">{expanded ? '还没有歌单，可以在歌单操作中选择本地分组。' : '暂无歌单'}</p>{/each}
                </div>
                {#if !expanded}
                  <button type="button" class="collection-group__trigger" aria-expanded="false" aria-label={`展开${group.title}分组`} onclick={() => openCollection(group.id)}>
                    <span class="collection-group__copy"><strong>{group.title}</strong><small>{group.items.length} 张歌单</small></span>
                  </button>
                {/if}
              </section>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</div>

<div class="library-management-portal" use:playlistPortal>

  <!-- 创建歌单弹窗 -->
  {#if showCreateModal}
    <CreatePlaylistModal
      onClose={() => showCreateModal = false}
      onCreated={load}
      onNotice={showNotice}
    />
  {/if}

  <!-- 编辑歌单（改名 / 改简介） -->
  {#if editTarget}
    <PlaylistEditModal pl={editTarget} onClose={() => editTarget = null} onNotice={showNotice} />
  {/if}
  {#if groupTarget}
    <PlaylistGroupPicker playlist={groupTarget} onClose={() => groupTarget = null} onNotice={showNotice} />
  {/if}

  <!-- 取消收藏确认 -->
  <ConfirmDialog
    show={!!unsubscribeTarget}
    title="取消收藏"
    message="确定要取消收藏「{unsubscribeTarget?.name}」吗？"
    confirmText="取消收藏"
    danger={true}
    onConfirm={submitUnsubscribe}
    onCancel={closeUnsubscribe}
  />

  <!-- 删除歌单确认 -->
  <ConfirmDialog
    show={!!deleteTarget}
    title="删除歌单"
    message="确定要删除「{deleteTarget?.name}」吗？删除后无法恢复。"
    confirmText="删除"
    danger={true}
    onConfirm={submitDelete}
    onCancel={closeDelete}
  />
</div>

{#if optionsTarget}
  {@const selected = optionsTarget}
  {@const actions: PlaylistAction[] = [
    { label: '打开歌单', icon: 'folder', onSelect: () => closeOptions(() => openGroupPlaylist(selected.pl)) },
    { label: '加入播放队列', icon: 'add', onSelect: () => closeOptions(() => void queuePlaylist(selected.pl.id, 'append')) },
    { label: '下一首插播', icon: 'queue', onSelect: () => closeOptions(() => void queuePlaylist(selected.pl.id, 'next')) },
    { label: '分享歌单', icon: 'share', onSelect: () => closeOptions(() => void sharePlaylist(selected.pl.id, String(selected.pl.name))) },
    { label: '整理分组', icon: 'folder', onSelect: () => closeOptions(() => { groupTarget = selected.pl }) },
    // 管理项由策略模块决定：非本人歌单不会出现编辑/删除
    ...libraryPlaylistActions(selected.kind).map(action => ({
      label: action.label,
      icon: action.icon,
      danger: action.danger,
      onSelect: () => closeOptions(() => {
        if (action.id === 'edit') editTarget = selected.pl
        else if (action.id === 'delete') confirmDelete(selected.pl)
        else confirmUnsubscribe(selected.pl)
      }),
    })),
  ]}
  <div class="library-options-portal" use:playlistPortal>
  <PlaylistActionSheet show={!optionsClosing} title={String(selected.pl.name)} cover={selected.pl.picUrl || ''} {actions} bottomOnDesktop
    onPlay={() => closeOptions(() => void queuePlaylist(selected.pl.id, 'play'))} onClose={() => closeOptions()} onClosed={finishOptions} />
  </div>
{/if}

<style>
  .library-unified { display: grid; gap: 28px; }
  .library-identity { position: relative; isolation: isolate; display: grid; grid-template-columns: minmax(0, 1fr); justify-items: start; gap: 20px; padding: 26px 30px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--text) 12%, var(--border)); border-radius: var(--radius-xl); background: var(--bg-surface); }
  .library-identity__background { position: absolute; inset: 0; z-index: -1; background-position: center; background-size: cover; opacity: .05; }
  .library-identity::after { content: ''; position: absolute; z-index: -1; right: -38px; top: 50%; width: 220px; aspect-ratio: 1; border: 1px solid color-mix(in srgb, var(--accent) 16%, transparent); border-radius: 50%; background: repeating-radial-gradient(circle, transparent 0 20px, color-mix(in srgb, var(--accent) 10%, transparent) 21px 22px, transparent 23px 34px); transform: translateY(-50%); pointer-events: none; }
  .library-identity__person { display: flex; align-items: center; min-width: 0; gap: 18px; }
  .library-identity__person img, .library-identity__avatar { flex: none; width: 84px; height: 84px; border: 2px solid color-mix(in srgb, var(--accent) 38%, var(--bg-surface)); border-radius: 50%; object-fit: cover; background: var(--bg-elevated); }
  .library-identity__avatar { display: grid; place-items: center; color: var(--text-secondary); }
  .library-identity__person > div { min-width: 0; }
  .library-eyebrow { color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .1em; }
  .library-identity h1 { overflow: hidden; margin: 0; font-size: 24px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
  .library-identity__name { display: flex; min-width: 0; align-items: center; flex-wrap: wrap; gap: 8px; }
  .library-identity__name > span { flex: none; padding: 3px 7px; border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent); border-radius: 999px; color: var(--accent); background: var(--accent-bg); font-size: 11px; font-weight: 700; }
  .library-identity__name > .library-identity__role { padding: 0; border: 0; background: transparent; color: var(--text-secondary); font-size: 12px; font-weight: 500; }
  .library-identity p { overflow: hidden; margin: 8px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
  .library-identity__stats { width: min(100%, 520px); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; padding-top: 16px; border-top: 1px solid var(--border); }
  .library-identity__stats > div { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .library-identity__stats strong { overflow: hidden; font-size: 20px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
  .library-identity__stats span { overflow: hidden; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .library-identity__social { display: flex; gap: 20px; margin-top: 10px; color: var(--text-secondary); font-size: 12px; }
  .library-identity__social strong { margin-left: 4px; color: var(--text); font-weight: 500; }
  .library-highlights { display: grid; grid-template-columns: minmax(0, min(50%, 280px)) minmax(0, 1fr); align-items: start; gap: 12px 16px; }
  .library-favorite { position: relative; isolation: isolate; overflow: hidden; width: 100%; aspect-ratio: 1; border: 2px solid color-mix(in srgb, var(--text) 35%, var(--border)); border-radius: var(--radius-xl); background: var(--bg-layer); color: white; }
  .library-favorite__art { position: absolute; inset: 0; z-index: -1; overflow: hidden; }
  .library-favorite__art::after { position: absolute; inset: 0; content: ''; pointer-events: none; background: linear-gradient(to top, rgb(235 235 237 / .96), rgb(235 235 237 / .75) 24%, transparent 65%); }
  .library-favorite__art :global(.liked-falls-badge) { display: none; }
  .library-favorite__art :global(.liked-falls-three) { grid-template-columns: repeat(3, 1fr); }
  .library-favorite__art :global(.liked-falls-col:nth-child(3) .liked-falls-track) { animation: likedFallsScroll 23s linear infinite; animation-delay: -7s; }
  .library-favorite__open { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: end; align-items: start; gap: 5px; padding: 24px; text-align: left; color: #202124; }
  .library-favorite__open span { font-size: 11px; font-weight: 700; letter-spacing: .1em; }
  .library-favorite__open strong { font-size: 23px; line-height: 1.2; }
  .library-favorite__open em { color: #505156; font-size: 13px; font-style: normal; }
  .library-favorite__open:focus-visible { outline-offset: -4px; }
  .library-activity { min-width: 0; display: grid; gap: 12px; }
  .library-activity :global(.profile-home__panel) { border-color: color-mix(in srgb, var(--text) 18%, var(--border)); }
  :global(html:not(.mobile-runtime)) .library-activity :global(.profile-home__panel) { padding: 16px; }
  :global(html:not(.mobile-runtime)) .library-activity :global(.profile-home__panel > header) { margin-bottom: 8px; }
  :global(html:not(.mobile-runtime)) .library-activity :global(.profile-home__track-list) { gap: 0; }
  :global(html:not(.mobile-runtime)) .library-activity :global(.profile-home__track-list > button) { min-height: 48px; grid-template-columns: 36px minmax(0, 1fr) 20px; padding: 5px 6px; }
  :global(html:not(.mobile-runtime)) .library-activity :global(.profile-home__track-list img), :global(html:not(.mobile-runtime)) .library-activity :global(.profile-home__track-empty) { width: 36px; height: 36px; }
  .library-shortcuts { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .library-shortcut { min-width: 0; min-height: 64px; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--text) 18%, var(--border)); border-radius: var(--radius-lg); background: var(--bg-surface); color: var(--text); text-align: left; transition: background-color var(--dur-fast) var(--ease-out); }
  .library-shortcut:hover { background: var(--bg-hover); }
  .library-shortcut__icon { flex: none; display: grid; place-items: center; color: var(--text-secondary); }
  .library-shortcut__copy { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .library-shortcut__copy strong { overflow: hidden; font-size: 14px; line-height: 1.35; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .library-shortcut__copy em { overflow: hidden; color: var(--text-secondary); font-size: 12px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
  .library-shortcut__arrow { flex: none; display: grid; place-items: center; color: var(--text-tertiary); transition: transform var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out); }
  .library-shortcut:hover .library-shortcut__arrow { transform: translateX(3px); color: var(--accent); }
  .library-playlists { min-width: 0; }
  .library-playlists__heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
  .library-playlists__heading h2 { margin-top: 4px; font-size: 21px; }
  .library-create { min-height: 42px; display: flex; align-items: center; gap: 5px; padding: 0 14px; border-radius: 999px; background: var(--accent-bg); color: var(--accent); font-weight: 500; white-space: nowrap; }
  .collection-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 260px)); gap: 24px; align-items: start; }
  .collection-group { position: relative; min-width: 0; padding-bottom: 52px; }
  .collection-group.expanded { grid-column: 1 / -1; }
  .collection-group.expanded { padding-bottom: 0; }
  .collection-group__trigger { position: absolute; z-index: 4; inset: 0; width: 100%; min-width: 0; display: flex; align-items: end; gap: 8px; padding: 0; border: 0; background: transparent; text-align: left; }
  .collection-group__trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; border-radius: var(--radius-md); }
  .collection-item__cover img { width: 100%; height: 100%; object-fit: cover; }
  .collection-item__cover :global(img[hidden]) { display: none; }
  .collection-group__copy { flex: 1; min-width: 0; display: grid; justify-items: start; gap: 4px; }
  .collection-group__copy strong { max-width: 100%; overflow: hidden; font-size: 15px; line-height: 20px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .collection-group__copy small, .collection-group__header span { color: var(--text-secondary); font-size: 12px; line-height: 18px; }
  .collection-group__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  .collection-group__header > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; }
  .collection-group__header strong { font-size: 18px; line-height: 1.35; }
  .collection-group__header button { min-height: 40px; display: flex; align-items: center; gap: 6px; padding: 0 14px; border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border)); border-radius: 999px; background: var(--accent-bg); color: var(--accent); font-size: 13px; font-weight: 500; transition: background-color 160ms ease; }
  .collection-group__header button:hover { background: color-mix(in srgb, var(--accent) 18%, var(--bg-surface)); }
  .collection-group__header button :global(svg) { transform: rotate(-90deg); }
  .collection-group__grid { display: grid; grid-template-columns: minmax(0, 1fr); height: 192px; }
  .collection-group.expanded .collection-group__grid { height: auto; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 22px 18px; }
  .collection-item { position: relative; min-width: 0; }
  .collection-group:not(.expanded) .collection-item { grid-area: 1 / 1; justify-self: center; align-self: start; width: min(60%, 165px); margin-top: 10px; transform: translateX(var(--cover-offset)); }
  .collection-group:not(.expanded) .collection-item__cover { border: 2px solid var(--bg-surface); box-shadow: 0 8px 18px rgb(0 0 0 / .22); transform: rotate(var(--cover-angle)); }
  .collection-group:not(.expanded) .collection-item__info, .collection-group:not(.expanded) .collection-item__menu { display: none; }
  .collection-item__open { width: 100%; min-width: 0; display: grid; gap: 9px; text-align: left; }
  .collection-item__cover { position: relative; width: 100%; aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; border-radius: var(--radius-md); background: var(--bg-elevated); color: var(--text-tertiary); }
  .collection-group.expanded .collection-item__cover::after { position: absolute; inset: 0; content: ''; border: 1px solid color-mix(in srgb, var(--text) 22%, transparent); border-radius: inherit; pointer-events: none; }
  .collection-item__info { min-width: 0; display: grid; gap: 4px; }
  .collection-item__info strong { overflow: hidden; min-height: 2.7em; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; font-size: 14px; line-height: 1.35; overflow-wrap: anywhere; }
  .collection-item__info small { color: var(--text-secondary); font-size: 12px; }
  .collection-item__menu { position: absolute; top: 2px; right: 2px; width: 44px; height: 44px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: white; }
  .collection-item__menu::before { position: absolute; inset: 5px; content: ''; border: 1px solid rgb(255 255 255 / .2); border-radius: 50%; background: rgb(20 20 24 / .66); transition: background-color 160ms ease, border-color 160ms ease; }
  .collection-item__menu :global(svg) { position: relative; }
  .collection-item__menu:hover::before, .collection-item__menu:focus-visible::before { background: rgb(20 20 24 / .88); border-color: rgb(255 255 255 / .45); }
  .collection-group__message { padding: 20px 0; color: var(--text-secondary); font-size: 13px; }
  .collection-error { margin-bottom: 12px; color: var(--danger); font-size: 13px; }
  .collection-error button { padding: 4px 8px; color: var(--accent); }
  @media (max-width: 700px) { .library-highlights { grid-template-columns: minmax(0, 1fr); } .collection-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 14px; } .collection-group__grid { height: 130px; } .collection-group:not(.expanded) .collection-item { width: min(55%, 108px); transform: translateX(var(--cover-offset-mobile)); } .collection-group.expanded .collection-group__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 12px; } }
  .library-management-portal { display: contents; }
  :global(html.mobile-runtime) .library-unified { gap: 24px; }
  @media (max-width: 800px) { .library-identity { grid-template-columns: minmax(0, 1fr); gap: 18px; } .library-identity__stats { padding-top: 16px; border-top: 1px solid var(--border); } .library-identity::after { width: 150px; right: -60px; opacity: .45; } }
  :global(html.mobile-runtime) .library-identity { grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 18px; }
  :global(html.mobile-runtime) .library-identity__person { gap: 12px; }
  :global(html.mobile-runtime) .library-identity__person img, :global(html.mobile-runtime) .library-identity__avatar { width: 58px; height: 58px; }
  :global(html.mobile-runtime) .library-identity h1 { font-size: 19px; }
  :global(html.mobile-runtime) .library-identity__stats { gap: 8px; padding-top: 14px; border-top: 1px solid var(--border); }
  :global(html.mobile-runtime) .library-identity__stats > div { gap: 6px; }
  :global(html.mobile-runtime) .library-identity__stats strong { font-size: 15px; }
  :global(html.mobile-runtime) .library-identity__stats span { font-size: 11px; }
  :global(html.mobile-runtime) .library-highlights { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: stretch; gap: 12px; }
  :global(html.mobile-runtime) .library-favorite { aspect-ratio: 1; min-width: 0; background: var(--bg-surface); color: white; }
  :global(html.mobile-runtime) .library-favorite__art { position: relative; height: auto; aspect-ratio: 1; z-index: 0; }
  :global(html.mobile-runtime) .library-favorite__art :global(.liked-falls-three) { grid-template-columns: repeat(3, 1fr); }
  :global(html.mobile-runtime) .library-favorite__art :global(.liked-falls-track) { animation: likedFallsScroll 20s linear infinite; }
  :global(html.mobile-runtime) .library-favorite__art :global(.liked-falls-col:nth-child(2) .liked-falls-track) { animation-duration: 26s; animation-delay: -13s; }
  :global(html.mobile-runtime) .library-favorite__art :global(.liked-falls-col:nth-child(3) .liked-falls-track) { animation-duration: 23s; animation-delay: -7s; }
  :global(html.mobile-runtime) .library-favorite__open { position: absolute; inset: 0; height: 100%; padding: 12px; color: #202124; gap: 3px; }
  :global(html.mobile-runtime) .library-favorite__open span { font-size: 9px; }
  :global(html.mobile-runtime) .library-favorite__open strong { font-size: 14px; }
  :global(html.mobile-runtime) .library-favorite__open em { font-size: 12px; }
  :global(html.mobile-runtime) .library-activity { grid-column: 1 / -1; grid-row: 2; }
  :global(html.mobile-runtime) .library-activity { gap: 16px; }
  :global(html.mobile-runtime) .library-activity :global(.profile-home__panel) { padding: 16px; border: 1px solid color-mix(in srgb, var(--text) 18%, var(--border)); border-radius: var(--radius-lg); background: var(--bg-surface); }
  :global(html.mobile-runtime) .library-shortcuts { grid-column: 2; grid-row: 1; grid-template-columns: 1fr; grid-template-rows: repeat(2, 1fr); gap: 10px; }
  :global(html.mobile-runtime) .library-shortcut { min-height: 72px; padding: 12px; }
  @media (max-width: 360px) { .library-shortcut__arrow { display: none; } }
  @media (prefers-reduced-motion: reduce) { .library-shortcut__arrow { transition: none; } .library-shortcut:hover .library-shortcut__arrow { transform: none; } }
  @media (prefers-reduced-motion: reduce) { .library-favorite__art :global(.liked-falls-track), :global(html.mobile-runtime) .library-favorite__art :global(.liked-falls-track) { animation: none; } }
  @media (prefers-reduced-motion: reduce) { .collection-item__menu::before { transition: none; } }
</style>
