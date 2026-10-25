<script module lang="ts">
  import type { UserProfileData } from '../../services/user-profile.ts'
  import type { NormalizedLocalHistorySong, NormalizedPlaylist } from '../../utils/normalize.ts'
  import { getStorageJson, setStorage } from '../../utils/storage.ts'
  interface HomeSnapshot { userId: string | number; profile: UserProfileData | null; recentTracks: NormalizedLocalHistorySong[]; recommendPlaylists: NormalizedPlaylist[]; localStats: { plays: number; milliseconds: number } }
  // ponytail: 持久化到 localStorage 让冷启动直接出上次内容；已截断到首屏用量（约几十 KB），再变大就迁到 dbCache/IDB
  let homeSnapshot = getStorageJson<HomeSnapshot | null>('home_snapshot', null)
  if (!homeSnapshot?.profile || !Array.isArray(homeSnapshot.profile.createdPlaylists)) homeSnapshot = null
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { CompactTrackInput } from '../../player/queue.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import { player } from '../../stores/player.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import { loadHomeData, loadLocalRecentTracks } from '../../services/home.ts'
  import { loadUserProfileData } from '../../services/user-profile.ts'
  import { loadListeningReport } from '../../services/listening-report-store.ts'
  import { summarizeReport, listeningTime } from '../../services/listening-report.ts'
  import { LISTENING_CHANGE } from '../../services/listening-recorder.ts'
  import type { NormalizedRecordSong } from '../../utils/normalize.ts'
  import { coverUrl } from '../../utils/image.ts'
  import UserProfileHero from '../../components/UserProfileHero.svelte'
  import ProfileQuickEntries from '../../components/ProfileQuickEntries.svelte'
  import RecentTracksModule from '../../components/RecentTracksModule.svelte'
  import WeeklyListenModule from '../../components/WeeklyListenModule.svelte'
  import PlaylistSection from '../../components/PlaylistSection.svelte'
  import PlaylistCoverCard from '../../components/PlaylistCoverCard.svelte'
  import { buildProfileQuickEntries } from '../../components/profile-quick-entries.ts'
  import SocialPreviewSection from '../../components/SocialPreviewSection.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  let { onNavigate, onOpenLogin, onOpenPlaylist, onOpenUser }: {
      onNavigate?: (view: string) => void
    onOpenLogin?: () => void
    onOpenPlaylist?: (id: unknown, push?: boolean, preview?: unknown) => void
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onOpenUser?: (id: unknown) => void
  } = $props()

  const userId = auth.user?.userId
  const initial = homeSnapshot?.userId === userId ? homeSnapshot : null
  let profile = $state<UserProfileData | null>(initial?.profile ?? null)
  let recentTracks = $state<NormalizedLocalHistorySong[]>(initial?.recentTracks ?? [])
  let recommendPlaylists = $state<NormalizedPlaylist[]>(initial?.recommendPlaylists ?? [])
  let localStats = $state(initial?.localStats ?? { plays: 0, milliseconds: 0 })
  let statsError = $state(false)
  let loading = $state(!initial)
  let error = $state('')
  let requestId = 0
  let statsRequestId = 0

  function save(): void {
    if (!auth.user?.userId) return
    homeSnapshot = { userId: auth.user.userId, profile, recentTracks: [...recentTracks], recommendPlaylists: [...recommendPlaylists], localStats: { ...localStats } }
    const persisted = profile && { ...profile, createdPlaylists: profile.createdPlaylists.slice(0, 6), weeklyTracks: profile.weeklyTracks.slice(0, 50) }
    // userId 必须跟着当前账号写：否则换号后快照仍是旧账号的 id，回到旧账号会读到新账号的资料
    setStorage('home_snapshot', { ...homeSnapshot, userId: auth.user?.userId ?? homeSnapshot?.userId, profile: persisted, recommendPlaylists: recommendPlaylists.slice(0, 6) })
  }

  async function load(): Promise<void> {
    const uid = auth.user?.userId
    if (!uid) return
    const rid = ++requestId
    loading = !profile
    error = ''
    try {
      const [profileData, homeData] = await Promise.all([
        loadUserProfileData(ncm, uid, { isOwn: true, fallbackUser: auth.user }),
        loadHomeData(ncm, auth.user),
      ])
      // 账号可能在请求期间切换：rid 没变也要按 owner 丢弃过期结果
      if (rid !== requestId || auth.user?.userId !== uid) return
      profile = profileData
      save()
      homeData?.recommendPromise?.then((items) => { if (rid === requestId && auth.user?.userId === uid) { recommendPlaylists = items; save() } }).catch(() => {})
    } catch (e) {
      if (rid === requestId && auth.user?.userId === uid && !profile) error = (e as { message?: string })?.message || '主页加载失败'
    } finally { if (rid === requestId) loading = false }
  }

  async function refreshLocal(): Promise<void> {
    const rid = ++statsRequestId
    const [stats, recent] = await Promise.allSettled([loadListeningReport(), loadLocalRecentTracks(8)])
    if (rid !== statsRequestId) return
    statsError = stats.status === 'rejected'
    if (stats.status === 'fulfilled') localStats = summarizeReport(stats.value.records)
    if (recent.status === 'fulfilled') recentTracks = recent.value.slice(0, 8)
    save()
  }

  function playWeekly(index: number): void { if (profile?.weeklyTracks.length) player.playQueue(profile.weeklyTracks as unknown as CompactTrackInput[], index) }

  // 快捷入口由共享构建器给出：资料库概览用同一份，数量/文案/目标不会跑偏
  const quickEntries = $derived(buildProfileQuickEntries({
    likedCount: profile?.likedPlaylist?.trackCount ?? 0,
    statsText: localStats.milliseconds ? `${localStats.plays} 次 · ${listeningTime(localStats.milliseconds)}` : '',
    statsError,
    recentCount: recentTracks.length,
    onOpenFavorites: () => profile?.likedPlaylist ? onOpenPlaylist?.(profile.likedPlaylist.id, true, profile.likedPlaylist) : onNavigate?.('liked'),
    onOpenStats: () => onNavigate?.('listeningStats'),
    onOpenRecent: () => onNavigate?.('recent'),
    onOpenDaily: () => onNavigate?.('dailyHistory'),
  }))

  $effect(() => { if (auth.isLoggedIn) untrack(load) })
  $effect(() => {
    refreshLocal()
    const refresh = () => refreshLocal()
    window.addEventListener('local-listening-history-change', refresh)
    window.addEventListener(LISTENING_CHANGE, refresh)
    return () => { statsRequestId++; window.removeEventListener('local-listening-history-change', refresh); window.removeEventListener(LISTENING_CHANGE, refresh) }
  })
  $effect(() => { if (!auth.isLoggedIn) { loading = false; profile = null; recentTracks = [] } })
  onMount(() => document.querySelector<HTMLElement>('.content-scroll')?.scrollTo({ top: 0 }))
</script>

<div class="profile-home">
  {#if !auth.isLoggedIn}
    <div class="profile-home__logged-out"><Icon name="user" size={54} /><h1>登录后打开你的音乐主页</h1><p>查看个人资料、听歌排行、歌单与音乐社交。</p><button onclick={onOpenLogin}>立即登录</button></div>
  {:else if loading && !profile}
    <div class="profile-home__hero-skeleton skeleton-block"></div>
    <ProfileQuickEntries loading />
  {:else if error && !profile}
    <div class="profile-home__logged-out"><h1>主页加载失败</h1><p>{error}</p><button onclick={load}>重试</button></div>
  {:else if profile}
    <UserProfileHero {profile} isOwn />

    <ProfileQuickEntries entries={quickEntries} />

    <div class="profile-home__dashboard">
      <RecentTracksModule onOpenAll={() => onNavigate?.('recent')} />

      <WeeklyListenModule
        tracks={profile.weeklyTracks}
        failed={profile.weeklyTracksFailed}
        onPlay={playWeekly}
        onRetry={load}
      />
    </div>

    {#if profile.createdPlaylists.length}
      <PlaylistSection kicker="CREATED BY YOU" title="创建的歌单" moreLabel="全部歌单" onMore={() => onNavigate?.('library')}>
        <div class="profile-home__cover-grid">
          {#each profile.createdPlaylists.slice(0, 6) as playlist (playlist.id)}
            <PlaylistCoverCard title={String(playlist.name ?? '')} meta={`${playlist.trackCount} 首歌曲`} cover={String(playlist.picUrl ?? '')}
              onSelect={() => onOpenPlaylist?.(playlist.id, true, playlist)} />
          {/each}
        </div>
      </PlaylistSection>
    {/if}

    {#if recommendPlaylists.length}
      <PlaylistSection kicker="FOR YOU" title="为你推荐" moreLabel="更多推荐" onMore={() => onNavigate?.('explore')}>
        <div class="profile-home__cover-grid">
          {#each recommendPlaylists.slice(0, 6) as playlist (playlist.id)}
            <PlaylistCoverCard title={String(playlist.name ?? '')} meta={String(playlist.copywriter ?? '') || `${playlist.trackCount} 首歌曲`} cover={String(playlist.picUrl ?? '')}
              onSelect={() => onOpenPlaylist?.(playlist.id, true, playlist)} />
          {/each}
        </div>
      </PlaylistSection>
    {/if}

    <SocialPreviewSection follows={profile.follows} followeds={profile.followeds} followsPreview={profile.followsPreview} followersPreview={profile.followersPreview} {onOpenUser} />
  {/if}
</div>

<style>
  .profile-home { display: grid; gap: 24px; }
  .profile-home__hero-skeleton { min-height: 316px; border-radius: var(--radius-xl); }
  .profile-home__dashboard { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .profile-home__cover-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
  .profile-home__logged-out { min-height: 520px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-tertiary); text-align: center; }
  .profile-home__logged-out h1 { color: var(--text); font-size: 28px; }
  .profile-home__logged-out button { margin-top: 8px; padding: 10px 24px; border-radius: 999px; color: white; background: var(--accent); font-weight: 700; transition: filter var(--motion-release) var(--ease-out); }
  .profile-home__logged-out button:hover { filter: brightness(1.08); }
  /* 区块错峰入场：只在挂载时播一次，后台刷新不重播；reduced-motion 由 desktop-system.css 全局兜底 */
  :global(html:not(.mobile-runtime)) .profile-home > :global(*) { animation: profile-home-in var(--motion-panel) var(--ease-out) both; }
  :global(html:not(.mobile-runtime)) .profile-home > :global(:nth-child(2)) { animation-delay: 40ms; }
  :global(html:not(.mobile-runtime)) .profile-home > :global(:nth-child(3)) { animation-delay: 80ms; }
  :global(html:not(.mobile-runtime)) .profile-home > :global(:nth-child(4)) { animation-delay: 120ms; }
  :global(html:not(.mobile-runtime)) .profile-home > :global(:nth-child(n+5)) { animation-delay: 160ms; }
  @keyframes profile-home-in { from { opacity: 0; transform: translateY(8px); } }
  @media (max-width: 1100px) { .profile-home__cover-grid { grid-template-columns: repeat(3, 1fr); } }

  :global(html.mobile-runtime) .profile-home { gap: 24px; }
  :global(html.mobile-runtime) .profile-home__dashboard { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero),
  :global(html.mobile-runtime) .profile-home__hero-skeleton { min-height: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: var(--text); }
  :global(html.mobile-runtime) .profile-home__hero-skeleton { height: 144px; background: var(--md-container); border-radius: var(--radius-md); }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__background),
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__wash) { display: none; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__content) { min-height: 144px; gap: 16px; padding: 4px 0; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__identity) { align-items: center; gap: 12px; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__avatar) { width: 76px; height: 76px; border: 0; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__label),
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero h1) { font-size: 22px; line-height: 1.2; color: var(--text); }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__name-line) { gap: 8px; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero p) { overflow: hidden; max-height: none; margin-top: 4px; font-size: 13px; line-height: 1.4; color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__identity-label) { margin-top: 4px; padding: 2px 8px; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__stats) { gap: 8px; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__stats div) { gap: 0; padding: 2px 0; border: 0; background: none; backdrop-filter: none; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__stats strong) { font-size: 16px; line-height: 1.25; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__stats span) { font-size: 13px; line-height: 1.3; }
  :global(html.mobile-runtime) .profile-home__cover-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 12px; }
  @media (max-width: 359px) {
    :global(html.mobile-runtime) .profile-home__cover-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (min-width: 600px) {
    :global(html.mobile-runtime) .profile-home__dashboard { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    :global(html.mobile-runtime) .profile-home__cover-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
</style>
