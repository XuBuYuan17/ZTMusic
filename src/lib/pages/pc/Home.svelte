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
  import { extractCover } from '../../utils/normalize.ts'
  import { formatPlayCount } from '../../format.ts'
  import UserProfileHero from '../../components/UserProfileHero.svelte'
  import SocialPreview from '../../components/SocialPreview.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  let { onNavigate, onOpenLogin, onOpenPlaylist, onOpenUser, profileOnly = false }: {
    profileOnly?: boolean
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
    setStorage('home_snapshot', { ...homeSnapshot, profile: persisted, recommendPlaylists: recommendPlaylists.slice(0, 6) })
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
        profileOnly ? Promise.resolve(null) : loadHomeData(ncm, auth.user),
      ])
      if (rid !== requestId) return
      profile = profileData
      save()
      homeData?.recommendPromise?.then((items) => { if (rid === requestId) { recommendPlaylists = items; save() } }).catch(() => {})
    } catch (e) {
      if (rid === requestId && !profile) error = (e as { message?: string })?.message || '主页加载失败'
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

  function playRecent(index: number): void { if (recentTracks.length) player.playQueue(recentTracks as unknown as CompactTrackInput[], index) }
  function playWeekly(index: number): void { if (profile?.weeklyTracks.length) player.playQueue(profile.weeklyTracks as unknown as CompactTrackInput[], index) }
  function coverOf(track: NormalizedLocalHistorySong | NormalizedRecordSong): string { return track.picUrl || extractCover(track) }

  const quickCards = $derived([
    { label: 'FAVORITES', title: '喜欢的音乐', value: `${profile?.likedPlaylist?.trackCount ?? 0} 首`, icon: 'heart-filled', action: () => profile?.likedPlaylist ? onOpenPlaylist?.(profile.likedPlaylist.id, true, profile.likedPlaylist) : onNavigate?.('liked') },
    { label: 'ON THIS DEVICE', title: '本地听歌统计', value: statsError ? '统计暂不可用 · 点击重试' : localStats.milliseconds ? `${localStats.plays} 次 · ${listeningTime(localStats.milliseconds)}` : '开始记录你的聆听', icon: 'music', action: () => onNavigate?.('listeningStats') },
    { label: 'CONTINUE', title: '最近播放', value: `${recentTracks.length} 首记录`, icon: 'clock', action: () => onNavigate?.('recent') },
    { label: 'DAILY', title: '历史日推', value: '回看每天为你推送的歌', icon: 'calendar', action: () => onNavigate?.('dailyHistory') },
  ])

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
    <div class="profile-home__quick-skeleton">{#each Array(4) as _}<span class="skeleton-block"></span>{/each}</div>
  {:else if error && !profile}
    <div class="profile-home__logged-out"><h1>主页加载失败</h1><p>{error}</p><button onclick={load}>重试</button></div>
  {:else if profile}
    <UserProfileHero {profile} isOwn />

    <section class="profile-home__quick">
      {#each quickCards as card}
        <button data-motion="card" onclick={card.action}><span class="profile-home__quick-icon"><Icon name={card.icon} size={21} fill={card.icon === 'calendar' ? 'none' : 'currentColor'} /></span><span class="profile-home__quick-label">{card.label}</span><strong>{card.title}</strong><em>{card.value}</em></button>
      {/each}
    </section>

    {#if !profileOnly}
    <div class="profile-home__dashboard">
      <section class="profile-home__panel">
        <header><div><span>CONTINUE</span><h2>最近播放</h2></div><button onclick={() => onNavigate?.('recent')}>查看全部</button></header>
        {#if recentTracks.length}
          <div class="profile-home__track-list">
            {#each recentTracks as track, index (track.id)}
              <button onclick={() => playRecent(index)}>
                {#if coverOf(track)}<img src={coverUrl(coverOf(track), 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="profile-home__track-empty">♫</span>{/if}
                <span><strong>{track.name}</strong><em>{(track.ar as Array<{ name?: string }> | undefined)?.map(a => a.name).filter(Boolean).join(' / ') || '未知歌手'}</em></span><Icon name="play" size={15} fill="currentColor" />
              </button>
            {/each}
          </div>
        {:else}<div class="profile-home__empty">播放一首歌后会显示在这里</div>{/if}
      </section>

      <section class="profile-home__panel">
        <header><div><span>WEEKLY</span><h2>本周常听</h2></div></header>
        {#if profile.weeklyTracks.length}
          <div class="profile-home__track-list profile-home__track-list--rank">
            {#each profile.weeklyTracks.slice(0, 8) as track, index (track.id)}
              <button onclick={() => playWeekly(index)}><span class="profile-home__rank">{String(index + 1).padStart(2, '0')}</span><span><strong>{track.name}</strong><em>{formatPlayCount(track.playCount)} 次播放</em></span><Icon name="play" size={15} fill="currentColor" /></button>
            {/each}
          </div>
        {:else}<div class="profile-home__empty">本周还没有公开的听歌排行</div>{/if}
      </section>
    </div>

    {#if profile.createdPlaylists.length}
      <section class="profile-home__section">
        <header><div><span>CREATED BY YOU</span><h2>创建的歌单</h2></div><button onclick={() => onNavigate?.('library')}>全部歌单</button></header>
        <div class="profile-home__cover-grid">
          {#each profile.createdPlaylists.slice(0, 6) as playlist (playlist.id)}
            <button data-motion="card" onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}><span class="profile-home__cover">{#if playlist.picUrl}<img src={coverUrl(playlist.picUrl, 320)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}♫{/if}</span><strong>{playlist.name}</strong><em>{playlist.trackCount} 首歌曲</em></button>
          {/each}
        </div>
      </section>
    {/if}

    {#if recommendPlaylists.length}
      <section class="profile-home__section">
        <header><div><span>FOR YOU</span><h2>为你推荐</h2></div><button onclick={() => onNavigate?.('explore')}>更多推荐</button></header>
        <div class="profile-home__cover-grid">
          {#each recommendPlaylists.slice(0, 6) as playlist (playlist.id)}
            <button data-motion="card" onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}><span class="profile-home__cover">{#if playlist.picUrl}<img src={coverUrl(playlist.picUrl, 320)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}♫{/if}</span><strong>{playlist.name}</strong><em>{playlist.copywriter || `${playlist.trackCount} 首歌曲`}</em></button>
          {/each}
        </div>
      </section>
    {/if}

    <div class="profile-home__social"><SocialPreview title="我的关注" count={profile.follows} users={profile.followsPreview} {onOpenUser} /><SocialPreview title="我的粉丝" count={profile.followeds} users={profile.followersPreview} {onOpenUser} /></div>
    {/if}
  {/if}
</div>

<style>
  .profile-home { display: grid; gap: 24px; }
  .profile-home__hero-skeleton { min-height: 316px; border-radius: var(--radius-xl); }
  .profile-home__quick-skeleton, .profile-home__quick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .profile-home__quick-skeleton span { min-height: 112px; border-radius: var(--radius-xl); }
  .profile-home__quick > button { min-width: 0; min-height: 112px; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto auto; align-content: center; gap: 4px 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-xl); color: var(--text); background: var(--bg-surface); text-align: left; transition: border-color var(--motion-release) var(--ease-out), background-color var(--motion-release) var(--ease-out); }
  .profile-home__quick > button:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); background: color-mix(in srgb, var(--bg-hover) 60%, var(--bg-surface)); }
  .profile-home__quick-icon { grid-row: 1 / 4; width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--accent); background: var(--accent-bg); transition: background-color var(--motion-release) var(--ease-out); }
  .profile-home__quick > button:hover .profile-home__quick-icon { background: var(--accent-bg-hover); }
  .profile-home__quick-label, .profile-home__panel header span, .profile-home__section header span { color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .1em; }
  .profile-home__quick strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
  .profile-home__quick em { overflow: hidden; color: var(--text-tertiary); font-size: 12px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
  .profile-home__dashboard, .profile-home__social { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .profile-home__panel, .profile-home__section { min-width: 0; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-surface); }
  .profile-home__panel > header, .profile-home__section > header { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .profile-home__panel h2, .profile-home__section h2 { margin-top: 4px; font-size: 20px; }
  .profile-home__panel header button, .profile-home__section header button { padding: 4px 8px; margin-right: -8px; border-radius: var(--radius-sm); color: var(--accent); font-size: 12px; transition: background-color var(--motion-release) var(--ease-out); }
  .profile-home__panel header button:hover, .profile-home__section header button:hover { background: var(--accent-bg); }
  .profile-home__track-list { display: grid; gap: 4px; }
  .profile-home__track-list > button { min-width: 0; display: grid; grid-template-columns: 44px minmax(0, 1fr) 20px; align-items: center; gap: 12px; padding: 8px; border-radius: var(--radius-md); color: var(--text); text-align: left; transition: background-color var(--motion-release) var(--ease-out); }
  .profile-home__track-list--rank > button { grid-template-columns: 32px minmax(0, 1fr) 20px; }
  .profile-home__track-list > button:hover { background: var(--bg-hover); }
  .profile-home__track-list > button > :global(svg) { color: var(--accent); opacity: 0; transition: opacity var(--motion-release) var(--ease-out); }
  .profile-home__track-list > button:hover > :global(svg), .profile-home__track-list > button:focus-visible > :global(svg) { opacity: 1; }
  .profile-home__track-list img, .profile-home__track-empty { width: 44px; height: 44px; display: grid; place-items: center; object-fit: cover; border-radius: var(--radius-sm); background: var(--bg-elevated); }
  .profile-home__track-list > button > span:not(.profile-home__rank):not(.profile-home__track-empty) { min-width: 0; display: grid; gap: 2px; }
  .profile-home__track-list strong, .profile-home__track-list em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .profile-home__track-list strong { font-size: 13px; }
  .profile-home__track-list em { color: var(--text-tertiary); font-size: 11px; font-style: normal; }
  .profile-home__rank { color: var(--text-tertiary); font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
  .profile-home__empty { min-height: 168px; display: grid; place-items: center; color: var(--text-tertiary); font-size: 12px; }
  .profile-home__cover-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
  .profile-home__cover-grid button { min-width: 0; display: grid; gap: 8px; color: var(--text); text-align: left; }
  .profile-home__cover { width: 100%; aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; border-radius: var(--radius-md); color: var(--text-tertiary); background: var(--bg-elevated); transition: box-shadow var(--motion-release) var(--ease-out); }
  .profile-home__cover img { width: 100%; height: 100%; object-fit: cover; transition: transform var(--motion-release) var(--ease-out); }
  .profile-home__cover-grid button:hover .profile-home__cover { box-shadow: var(--shadow-md); }
  .profile-home__cover-grid button:hover .profile-home__cover img { transform: scale(1.04); }
  .profile-home__cover-grid strong, .profile-home__cover-grid em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .profile-home__cover-grid strong { font-size: 13px; }
  .profile-home__cover-grid em { margin-top: -4px; color: var(--text-tertiary); font-size: 11px; font-style: normal; }
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
  @media (max-width: 1100px) { .profile-home__quick { grid-template-columns: repeat(2, 1fr); } .profile-home__cover-grid { grid-template-columns: repeat(3, 1fr); } }

  :global(html.mobile-runtime) .profile-home { gap: 24px; }
  :global(html.mobile-runtime) .profile-home__dashboard { display: none; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero),
  :global(html.mobile-runtime) .profile-home__hero-skeleton { min-height: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: var(--text); }
  :global(html.mobile-runtime) .profile-home__hero-skeleton { height: 144px; background: var(--md-container); border-radius: var(--radius-md); }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__background),
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__wash) { display: none; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__content) { min-height: 144px; gap: 16px; padding: 4px 0; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__identity) { align-items: center; gap: 12px; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__avatar) { width: 76px; height: 76px; border: 0; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__label),
  :global(html.mobile-runtime) .profile-home__panel header span,
  :global(html.mobile-runtime) .profile-home__section header span { display: none; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero h1) { font-size: 22px; line-height: 1.2; color: var(--text); }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__name-line) { gap: 8px; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero p) { overflow: hidden; max-height: none; margin-top: 4px; font-size: 13px; line-height: 1.4; color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__identity-label) { margin-top: 4px; padding: 2px 8px; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__stats) { gap: 8px; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__stats div) { gap: 0; padding: 2px 0; border: 0; background: none; backdrop-filter: none; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__stats strong) { font-size: 16px; line-height: 1.25; }
  :global(html.mobile-runtime) .profile-home :global(.user-profile-hero__stats span) { font-size: 13px; line-height: 1.3; }
  :global(html.mobile-runtime) .profile-home__quick,
  :global(html.mobile-runtime) .profile-home__quick-skeleton { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  :global(html.mobile-runtime) .profile-home__quick > button { min-height: 104px; grid-template-columns: minmax(0, 1fr); grid-template-rows: repeat(3, auto); align-content: start; gap: 4px; padding: 12px; border: 0; border-radius: var(--radius-sm); background: var(--bg-surface); }
  :global(html.mobile-runtime) .profile-home__quick > button:nth-child(-n+3) { background: var(--bg-surface); }
  :global(html.mobile-runtime) .profile-home__quick-skeleton span { min-height: 104px; border-radius: var(--radius-sm); }
  :global(html.mobile-runtime) .profile-home__quick-icon { grid-row: auto; width: 32px; height: 32px; border-radius: var(--radius-md); background: var(--md-surface); color: var(--md-primary); }
  :global(html.mobile-runtime) .profile-home__quick > button:hover .profile-home__quick-icon { background: var(--md-surface); }
  :global(html.mobile-runtime) .profile-home__quick-label { display: none; font-size: 12px; line-height: 16px; color: var(--md-primary); letter-spacing: .04em; }
  :global(html.mobile-runtime) .profile-home__quick strong { font-size: 16px; line-height: 22px; color: var(--text); }
  :global(html.mobile-runtime) .profile-home__quick em { font-size: 13px; line-height: 18px; color: var(--text-secondary); }
  :global(html.mobile-runtime) .profile-home__panel,
  :global(html.mobile-runtime) .profile-home__section { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  :global(html.mobile-runtime) .profile-home__panel > header,
  :global(html.mobile-runtime) .profile-home__section > header { align-items: center; min-height: 48px; margin-bottom: 8px; }
  :global(html.mobile-runtime) .profile-home .profile-home__panel h2,
  :global(html.mobile-runtime) .profile-home .profile-home__section h2 { margin-top: 0; font-size: 18px; line-height: 24px; }
  :global(html.mobile-runtime) .profile-home__panel header button,
  :global(html.mobile-runtime) .profile-home__section header button { min-width: 48px; min-height: 48px; margin-right: 0; font-size: 13px; }
  :global(html.mobile-runtime) .profile-home__track-list { gap: 2px; }
  :global(html.mobile-runtime) .profile-home__track-list > button { min-height: 60px; grid-template-columns: 44px minmax(0, 1fr) 16px; gap: 10px; padding: 6px 4px; }
  :global(html.mobile-runtime) .profile-home__track-list--rank > button { grid-template-columns: 28px minmax(0, 1fr) 16px; }
  :global(html.mobile-runtime) .profile-home__track-list > button > :global(svg) { opacity: 1; }
  :global(html.mobile-runtime) .profile-home__track-list strong { font-size: 14px; }
  :global(html.mobile-runtime) .profile-home__track-list em,
  :global(html.mobile-runtime) .profile-home__rank { font-size: 13px; }
  :global(html.mobile-runtime) .profile-home__empty { min-height: 80px; font-size: 13px; }
  :global(html.mobile-runtime) .profile-home__cover-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 12px; }
  :global(html.mobile-runtime) .profile-home__cover-grid button { min-height: 48px; gap: 6px; align-content: start; background: transparent; }
  :global(html.mobile-runtime) .profile-home__cover { border-radius: var(--radius-sm); box-shadow: none; }
  :global(html.mobile-runtime) .profile-home__cover-grid strong { display: -webkit-box; -webkit-box-orient: vertical; line-clamp: 2; -webkit-line-clamp: 2; min-height: 40px; font-size: 15px; line-height: 20px; white-space: normal; }
  :global(html.mobile-runtime) .profile-home__cover-grid em { margin-top: 0; font-size: 13px; line-height: 18px; }
  :global(html.mobile-runtime) .profile-home__cover-grid button:hover .profile-home__cover { box-shadow: none; }
  :global(html.mobile-runtime) .profile-home__cover-grid button:hover .profile-home__cover img { transform: none; }
  @media (max-width: 359px) {
    :global(html.mobile-runtime) .profile-home__cover-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (min-width: 600px) {
    :global(html.mobile-runtime) .profile-home__dashboard,
    :global(html.mobile-runtime) .profile-home__social { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    :global(html.mobile-runtime) .profile-home__cover-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
</style>
