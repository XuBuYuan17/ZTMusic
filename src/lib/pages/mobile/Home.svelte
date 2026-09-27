<script lang="ts">
  import { untrack } from 'svelte'
  import type { SongId } from '../../types/music.ts'
  import type { CompactTrackInput } from '../../player/queue.ts'
  import type { UserProfileData } from '../../services/user-profile.ts'
  import type { NormalizedLocalHistorySong, NormalizedPlaylist } from '../../utils/normalize.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import { player } from '../../stores/player.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import { loadUserProfileData } from '../../services/user-profile.ts'
  import { loadHomeData, loadLocalRecentTracks } from '../../services/home.ts'
  import { coverUrl } from '../../utils/image.ts'
  import { extractCover } from '../../utils/normalize.ts'
  import UserProfileHero from '../../components/UserProfileHero.svelte'
  import SocialPreview from '../../components/SocialPreview.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  let { onNavigate, onOpenLogin, onOpenPlaylist, onOpenUser, onSearch }: {
    onNavigate?: (view: string) => void
    onOpenLogin?: () => void
    onOpenPlaylist?: (id: unknown, push?: boolean, preview?: unknown) => void
    onOpenArtist?: (id: SongId) => void
    onOpenAlbum?: (id: unknown) => void
    onOpenUser?: (id: unknown) => void
    onSearch?: () => void
  } = $props()

  let profile = $state<UserProfileData | null>(null)
  let recentTracks = $state<NormalizedLocalHistorySong[]>([])
  let recommendations = $state<NormalizedPlaylist[]>([])
  let loading = $state(true)
  let error = $state('')
  let requestId = 0

  async function load(): Promise<void> {
    const uid = auth.user?.userId
    if (!uid) return
    const rid = ++requestId
    loading = !profile
    error = ''
    try {
      const [profileData, homeData, recent] = await Promise.all([
        loadUserProfileData(ncm, uid, { isOwn: true, fallbackUser: auth.user }),
        loadHomeData(ncm, auth.user),
        loadLocalRecentTracks(8),
      ])
      if (rid !== requestId) return
      profile = profileData
      recentTracks = recent.slice(0, 8)
      homeData.recommendPromise?.then(items => { if (rid === requestId) recommendations = items }).catch(() => {})
    } catch (e) {
      if (rid === requestId && !profile) error = (e as { message?: string })?.message || '主页加载失败'
    } finally { if (rid === requestId) loading = false }
  }

  function playRecent(index: number): void { if (recentTracks.length) player.playQueue(recentTracks as unknown as CompactTrackInput[], index) }
  function playWeekly(index: number): void { if (profile?.weeklyTracks.length) player.playQueue(profile.weeklyTracks as unknown as CompactTrackInput[], index) }
  function coverOf(track: NormalizedLocalHistorySong): string { return track.picUrl || extractCover(track) }

  $effect(() => { if (auth.isLoggedIn) untrack(load); else { loading = false; profile = null } })
  $effect(() => {
    const refresh = () => loadLocalRecentTracks(8).then(items => { recentTracks = items.slice(0, 8) })
    window.addEventListener('local-listening-history-change', refresh)
    return () => window.removeEventListener('local-listening-history-change', refresh)
  })
</script>

<div class="m-profile-home">
  <button class="m-profile-search" onclick={onSearch}><Icon name="search" size={16} /><span>搜索歌曲、歌手、歌单</span></button>

  {#if !auth.isLoggedIn}
    <div class="m-profile-empty"><Icon name="user" size={48} /><h1>登录开启音乐主页</h1><p>查看你的听歌排行、歌单和音乐社交。</p><button onclick={onOpenLogin}>立即登录</button></div>
  {:else if loading && !profile}
    <div class="m-profile-hero-skeleton skeleton-block"></div>
    <div class="m-profile-card-skeleton skeleton-block"></div>
  {:else if error && !profile}
    <div class="m-profile-empty"><h1>主页加载失败</h1><p>{error}</p><button onclick={load}>重试</button></div>
  {:else if profile}
    <UserProfileHero {profile} isOwn />

    <div class="m-profile-shortcuts">
      <button onclick={() => profile?.likedPlaylist && onOpenPlaylist?.(profile.likedPlaylist.id, true, profile.likedPlaylist)}><Icon name="heart-filled" size={19} /><strong>喜欢</strong><span>{profile.likedPlaylist?.trackCount ?? 0} 首</span></button>
      <button onclick={() => onNavigate?.('recent')}><Icon name="clock" size={19} /><strong>最近</strong><span>{recentTracks.length} 首</span></button>
      <button onclick={() => onNavigate?.('listeningStats')}><Icon name="music" size={19} /><strong>统计</strong><span>本机记录</span></button>
      <button onclick={() => onNavigate?.('library')}><Icon name="list" size={19} /><strong>歌单</strong><span>{profile.playlistCount} 个</span></button>
    </div>

    {#if recentTracks.length}
      <section class="m-profile-section">
        <header><h2>最近播放</h2><button onclick={() => onNavigate?.('recent')}>查看全部</button></header>
        <div class="m-profile-tracks">
          {#each recentTracks as track, index (track.id)}
            <button onclick={() => playRecent(index)}>{#if coverOf(track)}<img src={coverUrl(coverOf(track), 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span>♫</span>{/if}<strong>{track.name}</strong><Icon name="play" size={15} fill="currentColor" /></button>
          {/each}
        </div>
      </section>
    {/if}

    {#if profile.weeklyTracks.length}
      <section class="m-profile-section">
        <header><h2>本周常听</h2></header>
        <div class="m-profile-tracks">
          {#each profile.weeklyTracks.slice(0, 6) as track, index (track.id)}
            <button onclick={() => playWeekly(index)}><span class="rank">{index + 1}</span><strong>{track.name}</strong><em>{track.playCount} 次</em></button>
          {/each}
        </div>
      </section>
    {/if}

    {#if profile.createdPlaylists.length}
      <section class="m-profile-section">
        <header><h2>创建的歌单</h2><button onclick={() => onNavigate?.('library')}>全部</button></header>
        <div class="m-profile-covers">
          {#each profile.createdPlaylists.slice(0, 8) as playlist (playlist.id)}
            <button onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>{#if playlist.picUrl}<img src={coverUrl(playlist.picUrl, 240)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span>♫</span>{/if}<strong>{playlist.name}</strong><em>{playlist.trackCount} 首</em></button>
          {/each}
        </div>
      </section>
    {/if}

    {#if recommendations.length}
      <section class="m-profile-section">
        <header><h2>为你推荐</h2><button onclick={() => onNavigate?.('explore')}>更多</button></header>
        <div class="m-profile-covers">
          {#each recommendations.slice(0, 8) as playlist (playlist.id)}
            <button onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>{#if playlist.picUrl}<img src={coverUrl(playlist.picUrl, 240)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span>♫</span>{/if}<strong>{playlist.name}</strong><em>{playlist.trackCount} 首</em></button>
          {/each}
        </div>
      </section>
    {/if}

    <SocialPreview title="我的关注" count={profile.follows} users={profile.followsPreview} {onOpenUser} />
    <SocialPreview title="我的粉丝" count={profile.followeds} users={profile.followersPreview} {onOpenUser} />
  {/if}
</div>

<style>
  .m-profile-home { display: grid; gap: 16px; padding: 14px 14px 24px; }
  .m-profile-search { height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 13px; border: 1px solid var(--border); border-radius: 999px; color: var(--text-tertiary); background: color-mix(in srgb, var(--bg-layer) 82%, transparent); font-size: 12px; }
  .m-profile-hero-skeleton { min-height: 260px; border-radius: var(--radius-lg); }
  .m-profile-card-skeleton { min-height: 92px; border-radius: var(--radius-lg); }
  .m-profile-shortcuts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
  .m-profile-shortcuts button { min-width: 0; display: grid; justify-items: center; gap: 4px; padding: 11px 4px; border: 1px solid var(--border); border-radius: var(--radius-lg); color: var(--text); background: color-mix(in srgb, var(--bg-layer) 82%, transparent); }
  .m-profile-shortcuts :global(svg) { color: var(--accent); }
  .m-profile-shortcuts strong { font-size: 12px; }
  .m-profile-shortcuts span { width: 100%; overflow: hidden; color: var(--text-tertiary); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .m-profile-section { min-width: 0; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--bg-layer) 78%, transparent); }
  .m-profile-section > header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .m-profile-section h2 { font-size: 18px; }
  .m-profile-section header button { color: var(--accent); font-size: 11px; }
  .m-profile-tracks { display: grid; gap: 3px; }
  .m-profile-tracks > button { min-width: 0; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px; border-radius: var(--radius-md); color: var(--text); text-align: left; }
  .m-profile-tracks img, .m-profile-tracks > button > span:not(.rank) { width: 40px; height: 40px; display: grid; place-items: center; object-fit: cover; border-radius: var(--radius-sm); background: var(--bg-elevated); }
  .m-profile-tracks strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .m-profile-tracks em { color: var(--text-tertiary); font-size: 10px; font-style: normal; }
  .m-profile-tracks .rank { width: 40px; color: var(--text-tertiary); text-align: center; }
  .m-profile-covers { display: flex; gap: 12px; padding-bottom: 3px; overflow-x: auto; scrollbar-width: none; }
  .m-profile-covers button { flex: 0 0 112px; min-width: 0; display: grid; gap: 5px; color: var(--text); text-align: left; }
  .m-profile-covers img, .m-profile-covers button > span { width: 112px; height: 112px; display: grid; place-items: center; object-fit: cover; border-radius: var(--radius-md); background: var(--bg-elevated); }
  .m-profile-covers strong, .m-profile-covers em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .m-profile-covers strong { font-size: 12px; }
  .m-profile-covers em { color: var(--text-tertiary); font-size: 10px; font-style: normal; }
  .m-profile-empty { min-height: 430px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-tertiary); text-align: center; }
  .m-profile-empty h1 { color: var(--text); font-size: 22px; }
  .m-profile-empty p { font-size: 12px; }
  .m-profile-empty button { padding: 9px 18px; border-radius: 999px; color: white; background: var(--accent); font-weight: 700; }
</style>
