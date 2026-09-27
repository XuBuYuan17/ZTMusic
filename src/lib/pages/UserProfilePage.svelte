<script module lang="ts">
  import type { UserProfileData } from '../services/user-profile.ts'
  const profileCache = new Map<string, { data: UserProfileData; expires: number }>()
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import type { SongId } from '../types/music.ts'
  import type { CompactTrackInput } from '../player/queue.ts'
  import { auth } from '../stores/auth.svelte.ts'
  import { player } from '../stores/player.svelte.ts'
  import { toast } from '../stores/toast.svelte.ts'
  import { ncm } from '../api/client.ts'
  import { loadUserProfileData, withFollowState } from '../services/user-profile.ts'
  import { coverUrl } from '../utils/image.ts'
  import { formatPlayCount } from '../format.ts'
  import UserProfileHero from '../components/UserProfileHero.svelte'
  import SocialPreview from '../components/SocialPreview.svelte'
  import Icon from '../components/ui/Icon.svelte'
  import Spinner from '../components/Spinner.svelte'

  let { userId, onBack, onOpenUser, onOpenPlaylist, onOpenArtist, onOpenMessage }: {
    userId: SongId | null
    onBack?: () => void
    onOpenUser?: (id: unknown) => void
    onOpenPlaylist?: (id: unknown, push?: boolean, preview?: unknown) => void
    onOpenArtist?: (id: unknown) => void
    onOpenMessage?: (user: { userId: SongId; nickname?: unknown; avatarUrl?: unknown }) => void
  } = $props()

  let profile = $state<UserProfileData | null>(null)
  let loading = $state(true)
  let error = $state('')
  let followBusy = $state(false)
  let requestId = 0
  const isOwn = $derived(Boolean(userId && auth.user?.userId && String(auth.user.userId) === String(userId)))

  async function load(force = false): Promise<void> {
    if (!userId) return
    const rid = ++requestId
    const key = String(userId)
    const cached = profileCache.get(key)
    if (!force && cached && cached.expires > Date.now()) {
      profile = cached.data
      loading = false
      return
    }
    loading = true
    error = ''
    try {
      const data = await loadUserProfileData(ncm, userId, { isOwn, fallbackUser: isOwn ? auth.user : null })
      if (rid !== requestId) return
      profile = data
      profileCache.set(key, { data, expires: Date.now() + 3 * 60 * 1000 })
    } catch (e) {
      if (rid === requestId) error = (e as { message?: string })?.message || '用户资料加载失败'
    } finally {
      if (rid === requestId) loading = false
    }
  }

  async function toggleFollow(): Promise<void> {
    if (!profile || isOwn || followBusy) return
    const previous = profile
    const nextFollowed = !profile.followed
    profile = withFollowState(profile, nextFollowed)
    followBusy = true
    try {
      const response = await ncm.userFollow(profile.userId, nextFollowed) as { code?: number; message?: string; msg?: string } | null
      if (response?.code && response.code !== 200) throw new Error(response.message || response.msg || '操作失败')
      profileCache.set(String(profile.userId), { data: profile, expires: Date.now() + 3 * 60 * 1000 })
    } catch (e) {
      profile = previous
      toast.error((e as { message?: string })?.message || '关注操作失败')
    } finally {
      followBusy = false
    }
  }

  function playWeekly(index: number): void {
    if (profile?.weeklyTracks.length) player.playQueue(profile.weeklyTracks as unknown as CompactTrackInput[], index)
  }

  $effect(() => { if (userId) untrack(load) })
</script>

<div class="user-page fade-in">
  <button class="user-page__back" onclick={onBack}><Icon name="back" size={18} /> 返回</button>

  {#if loading && !profile}
    <div class="user-page__hero-skeleton skeleton-block"></div>
    <div class="user-page__loading"><Spinner /> 正在加载个人主页</div>
  {:else if error && !profile}
    <div class="user-page__error"><h2>暂时无法打开主页</h2><p>{error}</p><button onclick={() => load(true)}>重试</button></div>
  {:else if profile}
    <UserProfileHero
      {profile}
      {isOwn}
      {followBusy}
      onFollow={toggleFollow}
      onMessage={() => onOpenMessage?.({ userId: profile!.userId, nickname: profile!.nickname, avatarUrl: profile!.avatarUrl })}
      onOpenArtist={() => profile?.artistId && onOpenArtist?.(profile.artistId)}
    />

    <div class="user-page__grid">
      <section class="user-page__panel">
        <header><div><span>WEEKLY</span><h2>本周常听</h2></div><em>{profile.weeklyTracks.length ? `${profile.weeklyTracks.length} 首` : ''}</em></header>
        {#if profile.weeklyTracks.length}
          <div class="user-page__tracks">
            {#each profile.weeklyTracks as track, index (track.id)}
              <button onclick={() => playWeekly(index)}>
                <span class="user-page__rank">{index + 1}</span>
                {#if track.picUrl}<img src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
                <span class="user-page__track-copy"><strong>{track.name}</strong><em>{formatPlayCount(track.playCount)} 次播放</em></span>
                <Icon name="play" size={15} fill="currentColor" />
              </button>
            {/each}
          </div>
        {:else}<div class="user-page__empty">听歌排行未公开</div>{/if}
      </section>

      <section class="user-page__panel">
        <header><div><span>PLAYLISTS</span><h2>创建的歌单</h2></div><em>{profile.createdPlaylists.length ? `${profile.createdPlaylists.length} 个` : ''}</em></header>
        {#if profile.createdPlaylists.length}
          <div class="user-page__playlists">
            {#each profile.createdPlaylists.slice(0, 8) as playlist (playlist.id)}
              <button onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>
                {#if playlist.picUrl}<img src={coverUrl(playlist.picUrl, 220)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="user-page__cover-empty">♫</span>{/if}
                <strong>{playlist.name}</strong><em>{playlist.trackCount} 首</em>
              </button>
            {/each}
          </div>
        {:else}<div class="user-page__empty">暂无公开歌单</div>{/if}
      </section>
    </div>

    <div class="user-page__social">
      <SocialPreview title="关注" count={profile.follows} users={profile.followsPreview} {onOpenUser} />
      <SocialPreview title="粉丝" count={profile.followeds} users={profile.followersPreview} {onOpenUser} />
    </div>
  {/if}
</div>

<style>
  .user-page { display: grid; gap: 22px; }
  .user-page__back { width: fit-content; height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border: 1px solid var(--border); border-radius: 999px; color: var(--text-secondary); background: color-mix(in srgb, var(--bg-layer) 82%, transparent); font-size: 13px; font-weight: 700; }
  .user-page__hero-skeleton { min-height: 316px; border-radius: var(--radius-xl); }
  .user-page__loading, .user-page__error { min-height: 180px; display: grid; place-items: center; gap: 8px; color: var(--text-secondary); text-align: center; }
  .user-page__error button { padding: 9px 16px; border-radius: 999px; color: white; background: var(--accent); }
  .user-page__grid, .user-page__social { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr); gap: 18px; }
  .user-page__panel { min-width: 0; padding: 22px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: color-mix(in srgb, var(--bg-layer) 84%, transparent); }
  .user-page__panel > header { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 15px; }
  .user-page__panel header span { color: var(--accent); font-size: 9px; font-weight: 700; letter-spacing: .12em; }
  .user-page__panel h2 { margin-top: 3px; font-size: 20px; }
  .user-page__panel header > em { color: var(--text-tertiary); font-size: 11px; font-style: normal; }
  .user-page__tracks { display: grid; gap: 3px; }
  .user-page__tracks > button { min-width: 0; display: grid; grid-template-columns: 24px 42px minmax(0, 1fr) 20px; align-items: center; gap: 10px; padding: 7px 9px; border-radius: var(--radius-md); color: var(--text); text-align: left; }
  .user-page__tracks > button:hover { background: var(--bg-hover); }
  .user-page__tracks img { width: 42px; height: 42px; object-fit: cover; border-radius: var(--radius-sm); }
  .user-page__rank { color: var(--text-tertiary); font-size: 11px; text-align: center; }
  .user-page__track-copy { min-width: 0; display: grid; }
  .user-page__track-copy strong, .user-page__track-copy em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-page__track-copy strong { font-size: 13px; }
  .user-page__track-copy em { color: var(--text-tertiary); font-size: 10px; font-style: normal; }
  .user-page__playlists { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; }
  .user-page__playlists button { min-width: 0; display: grid; gap: 5px; color: var(--text); text-align: left; }
  .user-page__playlists img, .user-page__cover-empty { width: 100%; aspect-ratio: 1; display: grid; place-items: center; object-fit: cover; border-radius: var(--radius-md); background: var(--bg-elevated); }
  .user-page__playlists strong, .user-page__playlists em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-page__playlists strong { font-size: 12px; }
  .user-page__playlists em { color: var(--text-tertiary); font-size: 10px; font-style: normal; }
  .user-page__empty { min-height: 180px; display: grid; place-items: center; color: var(--text-tertiary); font-size: 12px; }
  @media (max-width: 1050px) { .user-page__grid, .user-page__social { grid-template-columns: 1fr; } }
  :global(html.mobile-runtime) .user-page { gap: 14px; padding: 12px 14px 24px; }
  :global(html.mobile-runtime) .user-page__back { position: sticky; top: 8px; z-index: 10; width: 38px; padding: 0; justify-content: center; color: white; background: rgba(20,20,22,.72); backdrop-filter: blur(16px); }
  :global(html.mobile-runtime) .user-page__back :global(svg) { margin: 0; }
  :global(html.mobile-runtime) .user-page__back { font-size: 0; }
  :global(html.mobile-runtime) .user-page__panel { padding: 16px; border-radius: var(--radius-lg); }
  :global(html.mobile-runtime) .user-page__playlists { display: flex; gap: 12px; overflow-x: auto; scrollbar-width: none; }
  :global(html.mobile-runtime) .user-page__playlists button { flex: 0 0 112px; }
  :global(html.mobile-runtime) .user-page__social { gap: 12px; }
</style>
